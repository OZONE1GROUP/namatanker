"""
Rule-based executive insights (spec section 6).

These are explicit, explainable thresholds over real records —
never machine-learning predictions, and every insight links back
to the record(s) that produced it.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.core import Order, Station, Tanker
from app.models.enums import ConnectivityStatus, OrderStatus
from app.schemas.dashboard import ExecutiveInsight

STALE_LOADING_THRESHOLD = timedelta(hours=2)
RECONCILIATION_BACKLOG_THRESHOLD = 3
LOW_ACTIVITY_ORDER_THRESHOLD = 2


def build_insights(db: Session, window_start: datetime) -> list[ExecutiveInsight]:
    insights: list[ExecutiveInsight] = []
    now = datetime.now(timezone.utc)

    # 1. Stations processing fewer orders than baseline (< threshold in window, but online)
    station_order_counts = dict(
        db.execute(
            select(Station.id, func.count(Order.id))
            .join(Order, Order.station_id == Station.id, isouter=True)
            .where((Order.created_at >= window_start) | (Order.created_at.is_(None)))
            .group_by(Station.id)
        ).all()
    )
    low_stations = db.execute(
        select(Station).where(Station.connectivity_status == ConnectivityStatus.online)
    ).scalars().all()
    for station in low_stations:
        count = station_order_counts.get(station.id, 0)
        if count < LOW_ACTIVITY_ORDER_THRESHOLD:
            insights.append(
                ExecutiveInsight(
                    id=f"low-activity-{station.id}",
                    severity="warning",
                    message=f"{station.name} processed only {count} order(s) in the selected window — below its configured baseline.",
                    entity_type="station",
                    entity_id=station.id,
                    entity_label=station.name,
                )
            )

    # 2. Tankers/orders stuck in loading beyond expected duration
    stale_cutoff = now - STALE_LOADING_THRESHOLD
    stuck_orders = db.execute(
        select(Order, Station, Tanker)
        .join(Station, Order.station_id == Station.id)
        .outerjoin(Tanker, Order.tanker_id == Tanker.id)
        .where(
            Order.status == OrderStatus.loading_in_progress,
            Order.created_at <= stale_cutoff,
        )
    ).all()
    for order, station, tanker in stuck_orders:
        tanker_label = tanker.tanker_code if tanker else "unassigned tanker"
        insights.append(
            ExecutiveInsight(
                id=f"stuck-loading-{order.id}",
                severity="critical",
                message=f"Order {order.order_number} ({tanker_label}) has remained in loading at {station.name} longer than expected.",
                entity_type="order",
                entity_id=order.id,
                entity_label=order.order_number,
            )
        )

    # 3. Reconciliation backlog
    pending_count = db.scalar(
        select(func.count(Order.id)).where(Order.status == OrderStatus.reconciliation_pending)
    ) or 0
    if pending_count >= RECONCILIATION_BACKLOG_THRESHOLD:
        insights.append(
            ExecutiveInsight(
                id="reconciliation-backlog",
                severity="warning",
                message=f"{pending_count} orders are awaiting reconciliation, consistent with a recent connectivity restoration.",
                entity_type="order",
                entity_id="reconciliation_pending",
                entity_label=f"{pending_count} pending orders",
            )
        )

    # 4. Authorization / meter mismatches
    mismatches = db.execute(
        select(Order).where(
            Order.status.in_([OrderStatus.meter_discrepancy, OrderStatus.failed_reconciliation])
        )
    ).scalars().all()
    for order in mismatches:
        insights.append(
            ExecutiveInsight(
                id=f"mismatch-{order.id}",
                severity="critical",
                message=f"Order {order.order_number} has a {order.status.value.replace('_', ' ')} requiring review.",
                entity_type="order",
                entity_id=order.id,
                entity_label=order.order_number,
            )
        )

    return insights[:8]  # keep the panel scannable
