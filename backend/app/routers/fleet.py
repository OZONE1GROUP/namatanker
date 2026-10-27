import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user, require_role
from app.database import get_db
from app.models.core import AuditEntry, Driver, Order, Tanker, User
from app.models.enums import (
    ACTIVE_LOADING_STATUSES,
    IN_TRANSIT_STATUSES,
    DriverDutyStatus,
    OrderStatus,
    Product,
    TankerStatus,
    UserRole,
)
from app.schemas.fleet import (
    CreateDriverRequest,
    CreateTankerRequest,
    DriverKycOut,
    DriverListItem,
    RecentOrderSummary,
    TankerDetail,
    TankerKycOut,
    TankerListItem,
)
from app.services import kyc as kyc_service

router = APIRouter(tags=["fleet"])

# Phase 9 — registering a driver or vehicle is a fleet-management action,
# matching the RBAC gate already used for stations/edge-gateway connectivity.
FLEET_ROLES = [UserRole.fleet_manager, UserRole.admin]

CURRENT_ORDER_STATUSES = ACTIVE_LOADING_STATUSES | IN_TRANSIT_STATUSES | {
    OrderStatus.dispatched,
    OrderStatus.arrived_at_station,
    OrderStatus.reconciliation_pending,
}


def _tanker_kyc_out(tanker: Tanker) -> TankerKycOut:
    status = kyc_service.tanker_kyc(tanker)
    return TankerKycOut(
        registration_expiry=tanker.registration_expiry,
        registration_status=status.registration_status,
        insurance_number=tanker.insurance_number,
        insurance_expiry=tanker.insurance_expiry,
        insurance_status=status.insurance_status,
        overall_status=status.overall_status,
    )


def _driver_kyc_out(driver: Driver) -> DriverKycOut:
    status = kyc_service.driver_kyc(driver)
    return DriverKycOut(
        civil_id_number=driver.civil_id_number,
        civil_id_expiry=driver.civil_id_expiry,
        civil_id_status=status.civil_id_status,
        license_number=driver.license_number,
        license_expiry=driver.license_expiry,
        license_status=status.license_status,
        overall_status=status.overall_status,
    )


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
                kyc_status=kyc_service.tanker_kyc(t).overall_status,
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
        kyc=_tanker_kyc_out(tanker),
    )


@router.post(
    "/tankers",
    response_model=TankerDetail,
    status_code=201,
    dependencies=[Depends(require_role(*FLEET_ROLES))],
)
def create_tanker(payload: CreateTankerRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    try:
        product = Product(payload.assigned_product)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Unknown product '{payload.assigned_product}'")

    seq = (db.scalar(select(func.count()).select_from(Tanker)) or 0) + 1
    new_id = str(uuid.uuid4())
    tanker = Tanker(
        id=new_id,
        tanker_code=f"TNK-{seq:03d}",
        registration_number=payload.registration_number,
        registration_expiry=payload.registration_expiry,
        insurance_number=payload.insurance_number,
        insurance_expiry=payload.insurance_expiry,
        capacity_l=payload.capacity_l,
        assigned_product=product,
        status=TankerStatus.idle,
        gps_signal_ok=True,
    )
    db.add(tanker)
    db.add(
        AuditEntry(
            actor=current_user.display_name,
            action="register_tanker",
            entity_type="tanker",
            entity_id=new_id,
            new_state="registered",
            reason=f"Vehicle {tanker.tanker_code} ({payload.registration_number}) added to the fleet",
        )
    )
    db.commit()
    db.refresh(tanker)
    return TankerDetail(
        id=tanker.id,
        tanker_code=tanker.tanker_code,
        registration_number=tanker.registration_number,
        capacity_l=tanker.capacity_l,
        assigned_product=tanker.assigned_product.value,
        status=tanker.status.value,
        gps_signal_ok=tanker.gps_signal_ok,
        last_lat=None,
        last_lon=None,
        last_comm_at=None,
        driver_id=None,
        driver_name=None,
        recent_orders=[],
        kyc=_tanker_kyc_out(tanker),
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
            kyc=_driver_kyc_out(d),
        )
        for d in drivers
    ]


@router.post(
    "/drivers",
    response_model=DriverListItem,
    status_code=201,
    dependencies=[Depends(require_role(*FLEET_ROLES))],
)
def create_driver(payload: CreateDriverRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    seq = (db.scalar(select(func.count()).select_from(Driver)) or 0) + 1
    new_id = str(uuid.uuid4())
    driver = Driver(
        id=new_id,
        driver_code=f"DRV-{seq:03d}",
        display_name=payload.display_name,
        duty_status=DriverDutyStatus.off_duty,
        qualification_status=payload.qualification_status,
        civil_id_number=payload.civil_id_number,
        civil_id_expiry=payload.civil_id_expiry,
        license_number=payload.license_number,
        license_expiry=payload.license_expiry,
    )
    db.add(driver)
    db.add(
        AuditEntry(
            actor=current_user.display_name,
            action="register_driver",
            entity_type="driver",
            entity_id=new_id,
            new_state="registered",
            reason=f"Driver {payload.display_name} ({driver.driver_code}) added to the roster",
        )
    )
    db.commit()
    db.refresh(driver)
    return DriverListItem(
        id=driver.id,
        driver_code=driver.driver_code,
        display_name=driver.display_name,
        duty_status=driver.duty_status.value,
        qualification_status=driver.qualification_status,
        assigned_tanker_code=None,
        kyc=_driver_kyc_out(driver),
    )
