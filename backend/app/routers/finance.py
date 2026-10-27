from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user, require_role
from app.database import get_db
from app.models.core import Order, User
from app.models.enums import Product, TransactionCategory, TransactionType, UserRole
from app.schemas.finance import (
    CommissionReport,
    FinanceSummary,
    PlatformSettingsOut,
    PlatformSettingsUpdateRequest,
    PricingOut,
    PricingUpdateRequest,
    StationCommissionRow,
    TransactionListResponse,
    TransactionOut,
)
from app.services import finance as finance_service

router = APIRouter(prefix="/finance", tags=["finance"])

ADMIN_ONLY = [UserRole.admin]


@router.get("/pricing", response_model=list[PricingOut])
def get_pricing(db: Session = Depends(get_db)):
    return [PricingOut.model_validate(r) for r in finance_service.list_pricing(db)]


@router.put(
    "/pricing/{product}",
    response_model=PricingOut,
    dependencies=[Depends(require_role(*ADMIN_ONLY))],
)
def set_pricing(
    product: str,
    payload: PricingUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        product_enum = Product(product)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown product '{product}'")
    row = finance_service.upsert_pricing(db, product_enum, payload.price_per_liter, actor=current_user.display_name)
    db.commit()
    db.refresh(row)
    return PricingOut.model_validate(row)


@router.get("/settings", response_model=PlatformSettingsOut)
def get_settings_endpoint(db: Session = Depends(get_db)):
    return PlatformSettingsOut.model_validate(finance_service.get_platform_settings(db))


@router.put(
    "/settings",
    response_model=PlatformSettingsOut,
    dependencies=[Depends(require_role(*ADMIN_ONLY))],
)
def update_settings_endpoint(
    payload: PlatformSettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    settings = finance_service.update_platform_settings(
        db,
        actor=current_user.display_name,
        platform_commission_pct=payload.platform_commission_pct,
        payment_gateway_enabled=payload.payment_gateway_enabled,
        payment_gateway_provider=payload.payment_gateway_provider,
        payment_gateway_mode=payload.payment_gateway_mode,
        payment_gateway_reference=payload.payment_gateway_reference,
    )
    db.commit()
    db.refresh(settings)
    return PlatformSettingsOut.model_validate(settings)


@router.get("/transactions", response_model=TransactionListResponse)
def list_transactions_endpoint(
    db: Session = Depends(get_db),
    type: str | None = Query(default=None),
    category: str | None = Query(default=None),
    order_id: str | None = Query(default=None),
    station_id: str | None = Query(default=None),
    search: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
):
    type_enum = None
    if type:
        try:
            type_enum = TransactionType(type)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown transaction type '{type}'")
    category_enum = None
    if category:
        try:
            category_enum = TransactionCategory(category)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown transaction category '{category}'")

    rows, total = finance_service.list_transactions(
        db,
        type_=type_enum,
        category=category_enum,
        order_id=order_id,
        station_id=station_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    order_numbers: dict[str, str] = {}
    order_ids = {r.order_id for r in rows if r.order_id}
    if order_ids:
        for o in db.query(Order).filter(Order.id.in_(order_ids)).all():
            order_numbers[o.id] = o.order_number

    items = []
    for r in rows:
        item = TransactionOut.model_validate(r)
        item.order_number = order_numbers.get(r.order_id) if r.order_id else None
        items.append(item)
    return TransactionListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/summary", response_model=FinanceSummary)
def get_summary(db: Session = Depends(get_db), days: int = Query(default=30, ge=1, le=365)):
    return FinanceSummary(**finance_service.get_finance_summary(db, days=days))


@router.get("/commission-report", response_model=CommissionReport)
def get_commission_report_endpoint(db: Session = Depends(get_db), days: int = Query(default=30, ge=1, le=365)):
    rows = finance_service.get_commission_report(db, days=days)
    return CommissionReport(period_days=days, rows=[StationCommissionRow(**r) for r in rows])
