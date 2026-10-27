import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user, require_role
from app.database import get_db
from app.models.core import AuditEntry, Customer, Driver, LoadingBay, Order, Station, Tanker, User
from app.models.enums import OrderStatus, Product, UserRole
from app.schemas.orders import (
    ActionResponse,
    AssignRequest,
    CompleteDeliveryRequest,
    CompleteLoadingRequest,
    CreateOrderRequest,
    OrderDetail,
    OrderListItem,
    OrderListResponse,
    ReasonRequest,
    StartLoadingRequest,
)
from app.services import orders as order_service

router = APIRouter(prefix="/orders", tags=["orders"])

ACTIONS_BY_STATUS: dict[OrderStatus, list[str]] = {
    OrderStatus.submitted: ["assign"],
    OrderStatus.awaiting_authorization: ["assign", "authorize", "reject"],
    OrderStatus.authorized: ["dispatch", "expire_authorization", "cancel"],
    OrderStatus.dispatched: ["arrive_at_station", "expire_authorization", "cancel"],
    OrderStatus.arrived_at_station: ["start_loading", "expire_authorization"],
    OrderStatus.loading_in_progress: ["complete_loading"],
    OrderStatus.loading_completed: ["depart_station"],
    OrderStatus.in_transit: ["complete_delivery"],
    OrderStatus.reconciliation_pending: ["reconcile"],
    OrderStatus.reconciled: ["close"],
}


def _order_detail(db: Session, order: Order) -> OrderDetail:
    audit_rows = db.execute(
        select(AuditEntry)
        .where(AuditEntry.entity_type == "order", AuditEntry.entity_id == order.id)
        .order_by(AuditEntry.timestamp.asc())
    ).scalars().all()

    bay = db.get(LoadingBay, order.loading_bay_id) if order.loading_bay_id else None
    driver = db.get(Driver, order.driver_id) if order.driver_id else None

    return OrderDetail(
        id=order.id,
        order_number=order.order_number,
        status=order.status.value,
        product=order.product.value,
        customer_id=order.customer_id,
        customer_name=order.customer.name,
        station_id=order.station_id,
        station_name=order.station.name,
        tanker_id=order.tanker_id,
        tanker_code=order.tanker.tanker_code if order.tanker else None,
        driver_id=order.driver_id,
        driver_name=driver.display_name if driver else None,
        loading_bay_id=order.loading_bay_id,
        loading_bay_code=bay.bay_code if bay else None,
        requested_quantity_l=order.requested_quantity_l,
        authorized_quantity_l=order.authorized_quantity_l,
        actual_loaded_quantity_l=order.actual_loaded_quantity_l,
        delivery_quantity_l=order.delivery_quantity_l,
        authorization_reference=order.authorization_reference,
        exception_details=order.exception_details,
        created_at=order.created_at,
        authorized_at=order.authorized_at,
        loaded_at=order.loaded_at,
        delivered_at=order.delivered_at,
        authorization=order.authorization,
        audit_history=list(audit_rows),
        available_actions=ACTIONS_BY_STATUS.get(order.status, []),
    )


def _get_order_or_404(db: Session, order_id: str) -> Order:
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.get("", response_model=OrderListResponse)
def list_orders(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    station_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    filters = []
    if status:
        try:
            filters.append(Order.status == OrderStatus(status))
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown status '{status}'")
    if station_id:
        filters.append(Order.station_id == station_id)
    if search:
        filters.append(Order.order_number.ilike(f"%{search}%"))

    base = select(Order).join(Customer).join(Station).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    rows = db.execute(
        base.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()

    items = [
        OrderListItem(
            id=o.id,
            order_number=o.order_number,
            customer_name=o.customer.name,
            station_name=o.station.name,
            product=o.product.value,
            status=o.status.value,
            requested_quantity_l=o.requested_quantity_l,
            tanker_code=o.tanker.tanker_code if o.tanker else None,
            created_at=o.created_at,
        )
        for o in rows
    ]
    return OrderListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/{order_id}", response_model=OrderDetail)
def get_order(order_id: str, db: Session = Depends(get_db)):
    order = _get_order_or_404(db, order_id)
    return _order_detail(db, order)


@router.post("", response_model=OrderDetail, status_code=201)
def create_order(payload: CreateOrderRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    customer = db.get(Customer, payload.customer_id)
    station = db.get(Station, payload.station_id)
    if not customer or not station:
        raise HTTPException(status_code=400, detail="Unknown customer or station")
    try:
        product = Product(payload.product)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown product '{payload.product}'")

    seq = (db.scalar(select(func.count()).select_from(Order)) or 0) + 1
    new_id = str(uuid.uuid4())
    order = Order(
        id=new_id,
        order_number=f"ORD-{uuid.uuid4().hex[:4].upper()}-{seq:05d}",
        customer_id=customer.id,
        station_id=station.id,
        product=product,
        requested_quantity_l=payload.requested_quantity_l,
        status=OrderStatus.submitted,
    )
    db.add(order)
    db.add(
        AuditEntry(
            actor=current_user.display_name,
            action="create_order",
            entity_type="order",
            entity_id=new_id,
            new_state=OrderStatus.submitted.value,
            reason="Order created",
        )
    )
    db.commit()
    db.refresh(order)
    return _order_detail(db, order)


def _run_action(db: Session, fn, *args, **kwargs) -> ActionResponse:
    try:
        result = fn(db, *args, **kwargs)
    except order_service.TransitionError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()
    db.refresh(result.order)
    return ActionResponse(order=_order_detail(db, result.order), message=result.note)


@router.post("/{order_id}/assign", response_model=ActionResponse)
def assign_order(order_id: str, payload: AssignRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    tanker = db.get(Tanker, payload.tanker_id)
    if not tanker:
        raise HTTPException(status_code=400, detail="Unknown tanker")
    driver = db.get(Driver, payload.driver_id) if payload.driver_id else None
    return _run_action(db, order_service.assign, order, tanker, driver, actor=current_user.display_name)


AUTHORIZER_ROLES = [UserRole.authorization_officer, UserRole.admin]


@router.post(
    "/{order_id}/authorize",
    response_model=ActionResponse,
    dependencies=[Depends(require_role(*AUTHORIZER_ROLES))],
)
def authorize_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    station = db.get(Station, order.station_id)
    return _run_action(db, order_service.authorize, order, station, actor=current_user.display_name)


@router.post(
    "/{order_id}/reject",
    response_model=ActionResponse,
    dependencies=[Depends(require_role(*AUTHORIZER_ROLES))],
)
def reject_order(order_id: str, payload: ReasonRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.reject_authorization, order, payload.reason, actor=current_user.display_name)


@router.post("/{order_id}/expire-authorization", response_model=ActionResponse)
def expire_authorization(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.expire_authorization, order, actor=current_user.display_name)


@router.post("/{order_id}/dispatch", response_model=ActionResponse)
def dispatch_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.dispatch, order, actor=current_user.display_name)


@router.post("/{order_id}/arrive-at-station", response_model=ActionResponse)
def arrive_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.arrive_at_station, order, actor=current_user.display_name)


@router.post("/{order_id}/start-loading", response_model=ActionResponse)
def start_loading_order(order_id: str, payload: StartLoadingRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    bay = db.get(LoadingBay, payload.loading_bay_id)
    if not bay:
        raise HTTPException(status_code=400, detail="Unknown loading bay")
    return _run_action(db, order_service.start_loading, order, bay, actor=current_user.display_name)


@router.post("/{order_id}/complete-loading", response_model=ActionResponse)
def complete_loading_order(order_id: str, payload: CompleteLoadingRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.complete_loading, order, payload.actual_loaded_quantity_l, actor=current_user.display_name)


@router.post("/{order_id}/depart-station", response_model=ActionResponse)
def depart_station_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.depart_station, order, actor=current_user.display_name)


@router.post("/{order_id}/complete-delivery", response_model=ActionResponse)
def complete_delivery_order(order_id: str, payload: CompleteDeliveryRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.complete_delivery, order, payload.delivery_quantity_l, actor=current_user.display_name)


@router.post("/{order_id}/reconcile", response_model=ActionResponse)
def reconcile_order(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.reconcile, order, actor=current_user.display_name)


@router.post("/{order_id}/close", response_model=ActionResponse)
def close_order_endpoint(order_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.close_order, order, actor=current_user.display_name)


@router.post("/{order_id}/cancel", response_model=ActionResponse)
def cancel_order(order_id: str, payload: ReasonRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order = _get_order_or_404(db, order_id)
    return _run_action(db, order_service.cancel, order, payload.reason, actor=current_user.display_name)
