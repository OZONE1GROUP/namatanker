from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user, require_role
from app.database import get_db
from app.models.core import AuditEntry, LoadingBay, Order, Station, User
from app.models.enums import (
    COMPLETED_DELIVERY_STATUSES,
    RECONCILIATION_EXCEPTION_STATUSES,
    ConnectivityStatus,
    OrderStatus,
    UserRole,
)
from app.schemas.stations import (
    LoadingBayOut,
    StationConnectivityActionResponse,
    StationDetail,
    StationListItem,
    StationOrderSummary,
)
from app.services.simulation import engine

router = APIRouter(prefix="/stations", tags=["stations"])

ACTIVE_STATUSES = {
    OrderStatus.awaiting_authorization,
    OrderStatus.authorized,
    OrderStatus.dispatched,
    OrderStatus.arrived_at_station,
    OrderStatus.loading_initiated,
    OrderStatus.loading_in_progress,
    OrderStatus.loading_completed,
    OrderStatus.in_transit,
}


@router.get("", response_model=list[StationListItem])
def list_stations(db: Session = Depends(get_db)):
    stations = db.execute(select(Station).order_by(Station.name)).scalars().all()
    out = []
    for s in stations:
        active = db.scalar(
            select(func.count()).select_from(Order).where(Order.station_id == s.id, Order.status.in_(ACTIVE_STATUSES))
        ) or 0
        completed = db.scalar(
            select(func.count()).select_from(Order).where(Order.station_id == s.id, Order.status.in_(COMPLETED_DELIVERY_STATUSES))
        ) or 0
        exceptions = db.scalar(
            select(func.count()).select_from(Order).where(Order.station_id == s.id, Order.status.in_(RECONCILIATION_EXCEPTION_STATUSES))
        ) or 0
        out.append(
            StationListItem(
                id=s.id,
                station_code=s.station_code,
                name=s.name,
                location=s.location,
                loading_bay_count=s.loading_bay_count,
                connectivity_status=s.connectivity_status.value,
                last_heartbeat=s.last_heartbeat,
                active_orders=active,
                completed_orders=completed,
                unresolved_exceptions=exceptions,
            )
        )
    return out


@router.get("/{station_id}", response_model=StationDetail)
def get_station(station_id: str, db: Session = Depends(get_db)):
    station = db.get(Station, station_id)
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")

    bays = db.execute(select(LoadingBay).where(LoadingBay.station_id == station_id).order_by(LoadingBay.bay_code)).scalars().all()
    bay_orders = {
        o.loading_bay_id: o
        for o in db.execute(
            select(Order).where(Order.station_id == station_id, Order.loading_bay_id.isnot(None), Order.status == OrderStatus.loading_in_progress)
        ).scalars().all()
    }

    active_rows = db.execute(
        select(Order).where(Order.station_id == station_id, Order.status.in_(ACTIVE_STATUSES)).order_by(Order.created_at.desc()).limit(25)
    ).scalars().all()

    completed_count = db.scalar(
        select(func.count()).select_from(Order).where(Order.station_id == station_id, Order.status.in_(COMPLETED_DELIVERY_STATUSES))
    ) or 0
    throughput = db.scalar(
        select(func.coalesce(func.sum(Order.actual_loaded_quantity_l), 0)).where(Order.station_id == station_id)
    ) or 0

    return StationDetail(
        id=station.id,
        station_code=station.station_code,
        name=station.name,
        location=station.location,
        loading_bay_count=station.loading_bay_count,
        connectivity_status=station.connectivity_status.value,
        last_heartbeat=station.last_heartbeat,
        edge_gateway_id=station.edge_gateway_id,
        loading_bays=[
            LoadingBayOut(
                id=b.id,
                bay_code=b.bay_code,
                status=b.status.value,
                current_order_id=bay_orders[b.id].id if b.id in bay_orders else None,
                current_order_number=bay_orders[b.id].order_number if b.id in bay_orders else None,
            )
            for b in bays
        ],
        active_orders=[
            StationOrderSummary(
                id=o.id, order_number=o.order_number, status=o.status.value,
                product=o.product.value, tanker_code=o.tanker.tanker_code if o.tanker else None,
            )
            for o in active_rows
        ],
        completed_orders_count=completed_count,
        throughput_volume_l=int(throughput),
    )


FLEET_ROLES = [UserRole.fleet_manager, UserRole.admin]


@router.post(
    "/{station_id}/disconnect",
    response_model=StationConnectivityActionResponse,
    dependencies=[Depends(require_role(*FLEET_ROLES))],
)
def disconnect_station(station_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    SIMULATION MODE — flips this station's simulated edge gateway to
    offline. While offline, the simulation engine keeps the station's
    PLC/meter telemetry advancing locally (a real edge gateway doesn't
    stop metering just because its WAN link drops) but queues it instead
    of forwarding it live, demonstrating store-and-forward recovery.
    """
    station = db.get(Station, station_id)
    if not station:
        raise HTTPException(404, "Station not found")
    if station.connectivity_status == ConnectivityStatus.offline:
        raise HTTPException(409, "Station is already offline.")

    previous = station.connectivity_status.value
    station.connectivity_status = ConnectivityStatus.offline
    db.add(AuditEntry(
        actor=current_user.display_name,
        action="edge_gateway_disconnect",
        entity_type="station",
        entity_id=station.id,
        previous_state=previous,
        new_state="offline",
        reason="Simulated WAN/edge gateway disconnect",
    ))
    engine.set_station_offline(station_id)
    db.commit()
    return StationConnectivityActionResponse(
        station_id=station.id,
        connectivity_status=station.connectivity_status.value,
        message=f"{station.name} is now simulated offline. Telemetry will queue at the edge until reconnected.",
    )


@router.post(
    "/{station_id}/reconnect",
    response_model=StationConnectivityActionResponse,
    dependencies=[Depends(require_role(*FLEET_ROLES))],
)
def reconnect_station(station_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """SIMULATION MODE — restores connectivity and flushes the queued telemetry built up while offline."""
    station = db.get(Station, station_id)
    if not station:
        raise HTTPException(404, "Station not found")
    if station.connectivity_status != ConnectivityStatus.offline:
        raise HTTPException(409, "Station is not offline.")

    queued_count = engine.set_station_online(station_id)
    station.connectivity_status = ConnectivityStatus.online
    station.last_heartbeat = datetime.now(timezone.utc)
    db.add(AuditEntry(
        actor=current_user.display_name,
        action="edge_gateway_resync",
        entity_type="station",
        entity_id=station.id,
        previous_state="offline",
        new_state="online",
        reason=f"Reconnected; flushed {queued_count} queued telemetry readings",
    ))
    db.commit()
    return StationConnectivityActionResponse(
        station_id=station.id,
        connectivity_status=station.connectivity_status.value,
        message=f"{station.name} reconnected. Synced {queued_count} queued readings.",
    )
