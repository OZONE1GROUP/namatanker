from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import Alert, Order, SimulationSettings, Station, Tanker
from app.models.enums import (
    ACTIVE_LOADING_STATUSES,
    COMPLETED_DELIVERY_STATUSES,
    IN_TRANSIT_STATUSES,
    RECONCILIATION_EXCEPTION_STATUSES,
    AlertSeverity,
    AlertStatus,
    ConnectivityStatus,
    OrderStatus,
    TankerStatus,
)
from app.schemas.dashboard import (
    DailyThroughputPoint,
    DashboardKpis,
    DashboardResponse,
    SimulationStatusOut,
    StationVolume,
    StatusCount,
    TankerActivityCount,
)
from app.services.insights import build_insights

router = APIRouter(tags=["dashboard"])


def _get_or_create_sim_settings(db: Session) -> SimulationSettings:
    settings = db.get(SimulationSettings, 1)
    if settings is None:
        settings = SimulationSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    station_id: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
):
    sim = _get_or_create_sim_settings(db)
    window_start = datetime.now(timezone.utc) - timedelta(days=days)

    order_filter = [Order.created_at >= window_start]
    if station_id:
        order_filter.append(Order.station_id == station_id)

    base_orders = select(Order).where(*order_filter)

    total_orders = db.scalar(select(func.count()).select_from(base_orders.subquery())) or 0

    def count_status_in(statuses: set[OrderStatus]) -> int:
        q = select(func.count()).select_from(
            select(Order).where(*order_filter, Order.status.in_(statuses)).subquery()
        )
        return db.scalar(q) or 0

    awaiting_auth = count_status_in({OrderStatus.awaiting_authorization})
    authorized = count_status_in(
        {
            OrderStatus.authorized,
            OrderStatus.dispatched,
            OrderStatus.arrived_at_station,
            OrderStatus.loading_initiated,
        }
    )
    active_loading = count_status_in(ACTIVE_LOADING_STATUSES)
    in_transit = count_status_in(IN_TRANSIT_STATUSES)
    completed = count_status_in(COMPLETED_DELIVERY_STATUSES)
    reconciliation_exceptions = count_status_in(RECONCILIATION_EXCEPTION_STATUSES)

    volume_loaded = db.scalar(
        select(func.coalesce(func.sum(Order.actual_loaded_quantity_l), 0)).where(*order_filter)
    ) or 0
    volume_delivered = db.scalar(
        select(func.coalesce(func.sum(Order.delivery_quantity_l), 0)).where(*order_filter)
    ) or 0

    station_q = select(func.count()).select_from(Station)
    connected_stations = db.scalar(
        station_q.where(Station.connectivity_status == ConnectivityStatus.online)
    ) or 0
    offline_stations = db.scalar(
        station_q.where(Station.connectivity_status == ConnectivityStatus.offline)
    ) or 0

    critical_alerts = db.scalar(
        select(func.count()).select_from(Alert).where(
            Alert.severity == AlertSeverity.critical,
            Alert.status.in_([AlertStatus.open, AlertStatus.escalated]),
        )
    ) or 0

    kpis = DashboardKpis(
        total_orders=total_orders,
        orders_awaiting_authorization=awaiting_auth,
        authorized_orders=authorized,
        active_loading_operations=active_loading,
        tankers_in_transit=in_transit,
        completed_deliveries=completed,
        total_volume_loaded_l=int(volume_loaded),
        volume_delivered_l=int(volume_delivered),
        reconciliation_exceptions=reconciliation_exceptions,
        connected_stations=connected_stations,
        offline_stations=offline_stations,
        critical_alerts=critical_alerts,
    )

    # Orders by status
    rows = db.execute(
        select(Order.status, func.count()).where(*order_filter).group_by(Order.status)
    ).all()
    orders_by_status = [StatusCount(status=s.value, count=c) for s, c in rows]

    # Volume by station
    vol_rows = db.execute(
        select(Station.name, func.coalesce(func.sum(Order.actual_loaded_quantity_l), 0))
        .join(Order, Order.station_id == Station.id)
        .where(*order_filter)
        .group_by(Station.name)
        .order_by(Station.name)
    ).all()
    volume_by_station = [StationVolume(station_name=n, volume_l=int(v)) for n, v in vol_rows]

    # Daily throughput trend
    day_rows = db.execute(
        select(
            func.date(Order.created_at).label("d"),
            func.count().label("orders"),
            func.coalesce(func.sum(Order.actual_loaded_quantity_l), 0).label("volume"),
        )
        .where(*order_filter)
        .group_by("d")
        .order_by("d")
    ).all()
    daily_throughput = [
        DailyThroughputPoint(date=str(d), orders=o, volume_l=int(v)) for d, o, v in day_rows
    ]

    # Tanker activity by status
    tanker_rows = db.execute(select(Tanker.status, func.count()).group_by(Tanker.status)).all()
    tanker_activity = [TankerActivityCount(status=s.value, count=c) for s, c in tanker_rows]

    insights = build_insights(db, window_start)

    return DashboardResponse(
        simulation_time=sim.simulation_time,
        kpis=kpis,
        orders_by_status=orders_by_status,
        volume_by_station=volume_by_station,
        daily_throughput=daily_throughput,
        tanker_activity=tanker_activity,
        insights=insights,
    )


@router.get("/simulation/status", response_model=SimulationStatusOut)
def simulation_status(db: Session = Depends(get_db)):
    sim = _get_or_create_sim_settings(db)
    return SimulationStatusOut(
        simulation_time=sim.simulation_time,
        speed_multiplier=sim.speed_multiplier,
        is_paused=sim.is_paused,
        mode=sim.mode,
    )
