from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import Alert, AuditEntry, Driver, Order, SimulationSettings, Station, Tanker
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
    AuditOverview,
    ConnectivityOverview,
    DailyCount,
    DailyThroughputPoint,
    DashboardKpis,
    DashboardResponse,
    FinanceOverview,
    KycBucket,
    KycOverview,
    SimulationStatusOut,
    StationVolume,
    StatusCount,
    TankerActivityCount,
)
from app.services import finance as finance_service
from app.services import kyc as kyc_service
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


def _kyc_bucket(statuses: list[str]) -> KycBucket:
    return KycBucket(
        valid=sum(1 for s in statuses if s == kyc_service.STATUS_VALID),
        expiring_soon=sum(1 for s in statuses if s == kyc_service.STATUS_EXPIRING_SOON),
        expired=sum(1 for s in statuses if s == kyc_service.STATUS_EXPIRED),
        missing=sum(1 for s in statuses if s == kyc_service.STATUS_MISSING),
    )


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
    degraded_stations = db.scalar(
        station_q.where(Station.connectivity_status == ConnectivityStatus.degraded)
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

    # Phase 8 module report — Finance & Revenue Share, scoped to the same `days` window as the rest of the page.
    finance_data = finance_service.get_finance_summary(db, days=days)
    finance_overview = FinanceOverview(
        period_days=finance_data["period_days"],
        total_inbound=finance_data["total_inbound"],
        total_outbound=finance_data["total_outbound"],
        platform_net_revenue=finance_data["platform_net_revenue"],
        transaction_count=finance_data["transaction_count"],
    )

    # Phase 9 module report — Driver & Vehicle KYC compliance, aggregated across the whole roster/fleet
    # (not time-windowed: KYC validity is a point-in-time state, not an event).
    all_drivers = db.execute(select(Driver)).scalars().all()
    all_tankers = db.execute(select(Tanker)).scalars().all()
    driver_statuses = [kyc_service.driver_kyc(d).overall_status for d in all_drivers]
    tanker_statuses = [kyc_service.tanker_kyc(t).overall_status for t in all_tankers]
    kyc_overview = KycOverview(
        drivers_total=len(all_drivers),
        drivers=_kyc_bucket(driver_statuses),
        tankers_total=len(all_tankers),
        tankers=_kyc_bucket(tanker_statuses),
    )

    connectivity_overview = ConnectivityOverview(
        online=connected_stations, degraded=degraded_stations, offline=offline_stations
    )

    # Audit Trail module report — recent activity volume, independent of the station/days filter above
    # (the audit trail is a global record, not scoped to one station).
    now_ts = datetime.now(timezone.utc)
    actions_24h = db.scalar(
        select(func.count()).select_from(AuditEntry).where(AuditEntry.timestamp >= now_ts - timedelta(hours=24))
    ) or 0
    actions_7d = db.scalar(
        select(func.count()).select_from(AuditEntry).where(AuditEntry.timestamp >= now_ts - timedelta(days=7))
    ) or 0
    audit_day_rows = db.execute(
        select(func.date(AuditEntry.timestamp).label("d"), func.count().label("c"))
        .where(AuditEntry.timestamp >= now_ts - timedelta(days=7))
        .group_by("d")
        .order_by("d")
    ).all()
    audit_overview = AuditOverview(
        actions_last_24h=actions_24h,
        actions_last_7d=actions_7d,
        trend=[DailyCount(date=str(d), count=c) for d, c in audit_day_rows],
    )

    return DashboardResponse(
        simulation_time=sim.simulation_time,
        kpis=kpis,
        orders_by_status=orders_by_status,
        volume_by_station=volume_by_station,
        daily_throughput=daily_throughput,
        tanker_activity=tanker_activity,
        insights=insights,
        finance=finance_overview,
        kyc=kyc_overview,
        connectivity=connectivity_overview,
        audit=audit_overview,
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
