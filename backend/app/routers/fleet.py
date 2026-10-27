from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import Driver, Order, Tanker
from app.models.enums import ACTIVE_LOADING_STATUSES, IN_TRANSIT_STATUSES, OrderStatus, TankerStatus
from app.schemas.fleet import DriverListItem, RecentOrderSummary, TankerDetail, TankerListItem

router = APIRouter(tags=["fleet"])

CURRENT_ORDER_STATUSES = ACTIVE_LOADING_STATUSES | IN_TRANSIT_STATUSES | {
    OrderStatus.dispatched,
    OrderStatus.arrived_at_station,
    OrderStatus.reconciliation_pending,
}


@router.get("/tankers", response_model=list[TankerListItem])
def list_tankers(db: Session = Depends(get_db)):
    tankers = db.execute(select(Tanker).order_by(Tanker.tanker_code)).scalars().all()
    out = []
    for t in tankers:
        current_order = None
        if t.status != TankerStatus.idle:
            current_order = db.execute(
                select(Order).where(Order.tanker_id == t.id, Order.status.in_(CURRENT_ORDER_STATUSES)).order_by(Order.created_at.desc())
            ).scalars().first()
        out.append(
            TankerListItem(
                id=t.id,
                tanker_code=t.tanker_code,
                registration_number=t.registration_number,
                capacity_l=t.capacity_l,
                assigned_product=t.assigned_product.value,
                status=t.status.value,
                gps_signal_ok=t.gps_signal_ok,
                driver_name=t.driver.display_name if t.driver else None,
                current_order_number=current_order.order_number if current_order else None,
            )
        )
    return out


@router.get("/tankers/{tanker_id}", response_model=TankerDetail)
def get_tanker(tanker_id: str, db: Session = Depends(get_db)):
    tanker = db.get(Tanker, tanker_id)
    if not tanker:
        raise HTTPException(status_code=404, detail="Tanker not found")
    recent = db.execute(
        select(Order).where(Order.tanker_id == tanker_id).order_by(Order.created_at.desc()).limit(15)
    ).scalars().all()
    return TankerDetail(
        id=tanker.id,
        tanker_code=tanker.tanker_code,
        registration_number=tanker.registration_number,
        capacity_l=tanker.capacity_l,
        assigned_product=tanker.assigned_product.value,
        status=tanker.status.value,
        gps_signal_ok=tanker.gps_signal_ok,
        last_lat=float(tanker.last_lat) if tanker.last_lat is not None else None,
        last_lon=float(tanker.last_lon) if tanker.last_lon is not None else None,
        last_comm_at=tanker.last_comm_at,
        driver_id=tanker.driver.id if tanker.driver else None,
        driver_name=tanker.driver.display_name if tanker.driver else None,
        recent_orders=[
            RecentOrderSummary(
                id=o.id, order_number=o.order_number, status=o.status.value,
                station_name=o.station.name, created_at=o.created_at,
            )
            for o in recent
        ],
    )


@router.get("/drivers", response_model=list[DriverListItem])
def list_drivers(db: Session = Depends(get_db)):
    drivers = db.execute(select(Driver).order_by(Driver.driver_code)).scalars().all()
    return [
        DriverListItem(
            id=d.id,
            driver_code=d.driver_code,
            display_name=d.display_name,
            duty_status=d.duty_status.value,
            qualification_status=d.qualification_status,
            assigned_tanker_code=d.tanker.tanker_code if d.tanker else None,
        )
        for d in drivers
    ]
