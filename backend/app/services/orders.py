"""
Order lifecycle state machine (spec section 8).

Every transition is explicit and validated here — the API layer never lets
the frontend move an order to an arbitrary status. Each successful
transition writes an AuditEntry, so the Audit Trail is a byproduct of the
workflow rather than something bolted on separately.

For readability/demo purposes a few of the 15 "happy path" states in the
spec are merged into one action (see ORDER_WORKFLOW_NOTE below) — this is
a documented simplification, not a missing feature: every state the spec
lists still exists on the model and in OrderStatus, and every exception
state is reachable.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.core import Authorization, AuditEntry, Driver, LoadingBay, Order, Station, Tanker
from app.models.enums import (
    AuthorizationStatus,
    DriverDutyStatus,
    LoadingBayStatus,
    OrderStatus,
    TankerStatus,
)
from app.services import finance as finance_service

ORDER_WORKFLOW_NOTE = (
    "Draft/Submitted/Validated are collapsed into order creation, and "
    "Loading Initiated/Reconciliation Pending are collapsed into their "
    "neighboring actions below, to keep the demo workflow to one click per "
    "real decision. Every status in the spec's 15-state lifecycle plus all "
    "6 exception states is still a reachable OrderStatus value."
)

# Tolerance bands for simulated meter/reconciliation variance (spec sections 11/18).
LOADING_TOLERANCE_FRACTION = 0.02  # ±2% of authorized quantity
DELIVERY_TOLERANCE_FRACTION = 0.02  # ±2% of loaded quantity


class TransitionError(ValueError):
    """Raised when a requested action is not legal from the order's current state."""


@dataclass
class ActionResult:
    order: Order
    note: str


def _audit(
    db: Session, order: Order, action: str, previous: str, new: str, reason: str | None = None,
    *, actor: str = "Operations Manager (demo role)",
):
    db.add(
        AuditEntry(
            actor=actor,
            action=action,
            entity_type="order",
            entity_id=order.id,
            previous_state=previous,
            new_state=new,
            reason=reason,
            correlation_id=order.authorization_reference,
        )
    )


def _require_status(order: Order, *allowed: OrderStatus):
    if order.status not in allowed:
        allowed_names = ", ".join(s.value for s in allowed)
        raise TransitionError(
            f"Cannot perform this action from status '{order.status.value}'. "
            f"Expected one of: {allowed_names}."
        )


def assign(db: Session, order: Order, tanker: Tanker, driver: Driver | None, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.submitted, OrderStatus.awaiting_authorization)
    if tanker.assigned_product != order.product:
        raise TransitionError(
            f"{tanker.tanker_code} is provisioned for {tanker.assigned_product.value}, "
            f"not {order.product.value} — not a compatible tanker for this order."
        )
    if tanker.status not in (TankerStatus.idle, TankerStatus.returning):
        raise TransitionError(f"{tanker.tanker_code} is currently '{tanker.status.value}' and not available for a new order.")

    previous = order.status.value
    order.tanker_id = tanker.id
    order.driver_id = driver.id if driver else None
    order.status = OrderStatus.awaiting_authorization
    tanker.status = TankerStatus.dispatched
    if driver:
        driver.duty_status = DriverDutyStatus.on_duty
    _audit(db, order, "assign_tanker_driver", previous, order.status.value, f"Assigned {tanker.tanker_code}" + (f" / {driver.display_name}" if driver else ""), actor=actor)
    return ActionResult(order, f"Assigned {tanker.tanker_code} and moved to Awaiting Authorization.")


def authorize(db: Session, order: Order, station: Station, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.awaiting_authorization)
    if not order.tanker_id:
        raise TransitionError("Cannot authorize an order with no tanker assigned.")

    previous = order.status.value
    now = datetime.now(timezone.utc)
    auth = Authorization(
        order_id=order.id,
        station_id=order.station_id,
        tanker_id=order.tanker_id,
        driver_id=order.driver_id,
        max_authorized_quantity_l=order.requested_quantity_l,
        status=AuthorizationStatus.valid,
        correlation_id=f"CORR-{order.order_number}",
        issued_at=now,
        expires_at=now + timedelta(hours=4),
        verification_result="Signature verified (SIMULATION test signer)",
    )
    db.add(auth)
    order.authorized_quantity_l = order.requested_quantity_l
    order.authorized_at = now
    order.authorization_reference = auth.correlation_id
    order.status = OrderStatus.authorized
    _audit(db, order, "authorize", previous, order.status.value, "Authorization issued and verified", actor=actor)
    return ActionResult(order, "Authorization issued.")


def reject_authorization(db: Session, order: Order, reason: str, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.awaiting_authorization)
    previous = order.status.value
    order.status = OrderStatus.rejected
    order.exception_details = reason
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.idle
    _audit(db, order, "reject_authorization", previous, order.status.value, reason, actor=actor)
    return ActionResult(order, "Authorization rejected.")


def expire_authorization(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    """Manually trigger the expired-authorization exception scenario for demos."""
    _require_status(order, OrderStatus.authorized, OrderStatus.dispatched, OrderStatus.arrived_at_station)
    previous = order.status.value
    if order.authorization:
        order.authorization.status = AuthorizationStatus.expired
    order.status = OrderStatus.expired_authorization
    order.exception_details = "Authorization token expired before loading could commence."
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.idle
    _audit(db, order, "expire_authorization", previous, order.status.value, actor=actor)
    return ActionResult(order, "Authorization expired.")


def dispatch(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.authorized)
    previous = order.status.value
    order.status = OrderStatus.dispatched
    _audit(db, order, "dispatch", previous, order.status.value, actor=actor)
    return ActionResult(order, "Tanker dispatched to station.")


def arrive_at_station(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.dispatched)
    previous = order.status.value
    order.status = OrderStatus.arrived_at_station
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.at_station
    _audit(db, order, "arrive_at_station", previous, order.status.value, actor=actor)
    return ActionResult(order, "Tanker arrived at station.")


def start_loading(db: Session, order: Order, bay: LoadingBay, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.arrived_at_station)
    if order.authorization is None or order.authorization.status != AuthorizationStatus.valid:
        raise TransitionError("Cannot start loading without a valid authorization.")
    if order.authorization.expires_at and order.authorization.expires_at < datetime.now(timezone.utc):
        raise TransitionError(
            "Authorization has expired. Use the 'Mark authorization expired' action "
            "to move this order to Expired Authorization before retrying."
        )
    if bay.station_id != order.station_id:
        raise TransitionError("Selected loading bay does not belong to this order's station.")
    if bay.status != LoadingBayStatus.idle:
        raise TransitionError(f"Bay {bay.bay_code} is currently '{bay.status.value}' and not available.")

    previous = order.status.value
    order.status = OrderStatus.loading_in_progress
    order.loading_bay_id = bay.id
    bay.status = LoadingBayStatus.occupied
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.loading
    _audit(db, order, "start_loading", previous, order.status.value, f"Bay {bay.bay_code}", actor=actor)
    return ActionResult(order, f"Loading started at bay {bay.bay_code}.")


def complete_loading(db: Session, order: Order, actual_loaded_quantity_l: int, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.loading_in_progress)
    previous = order.status.value
    order.actual_loaded_quantity_l = actual_loaded_quantity_l
    order.loaded_at = datetime.now(timezone.utc)

    if order.loading_bay_id:
        bay = db.get(LoadingBay, order.loading_bay_id)
        if bay:
            bay.status = LoadingBayStatus.idle

    authorized = order.authorized_quantity_l or order.requested_quantity_l
    variance = abs(actual_loaded_quantity_l - authorized)
    tolerance = authorized * LOADING_TOLERANCE_FRACTION
    if variance > tolerance:
        order.status = OrderStatus.meter_discrepancy
        order.exception_details = (
            f"Loaded {actual_loaded_quantity_l:,} L vs authorized {authorized:,} L "
            f"— variance of {variance:,.0f} L exceeds the ±2% tolerance band."
        )
        note = "Loading completed with a meter discrepancy requiring review."
    else:
        order.status = OrderStatus.loading_completed
        note = "Loading completed within tolerance."

    _audit(db, order, "complete_loading", previous, order.status.value, f"Actual: {actual_loaded_quantity_l} L", actor=actor)
    return ActionResult(order, note)


def depart_station(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.loading_completed)
    previous = order.status.value
    order.status = OrderStatus.in_transit
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.in_transit
    _audit(db, order, "depart_station", previous, order.status.value, actor=actor)
    return ActionResult(order, "Tanker departed and is in transit.")


def complete_delivery(db: Session, order: Order, delivery_quantity_l: int, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.in_transit)
    previous = order.status.value
    order.delivery_quantity_l = delivery_quantity_l
    order.delivered_at = datetime.now(timezone.utc)
    order.status = OrderStatus.reconciliation_pending
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.returning
    _audit(db, order, "complete_delivery", previous, order.status.value, f"Delivered: {delivery_quantity_l} L", actor=actor)
    return ActionResult(order, "Delivery recorded; reconciliation pending.")


def reconcile(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.reconciliation_pending)
    previous = order.status.value
    loaded = order.actual_loaded_quantity_l or 0
    delivered = order.delivery_quantity_l or 0
    variance = abs(loaded - delivered)
    tolerance = loaded * DELIVERY_TOLERANCE_FRACTION if loaded else 0

    if variance > tolerance:
        order.status = OrderStatus.failed_reconciliation
        order.exception_details = (
            f"Delivered {delivered:,} L vs loaded {loaded:,} L — variance of "
            f"{variance:,.0f} L exceeds the ±2% reconciliation tolerance."
        )
        note = "Reconciliation failed — variance outside tolerance."
    else:
        order.status = OrderStatus.reconciled
        note = "Reconciled within tolerance."

    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.idle
            if tanker.driver:
                tanker.driver.duty_status = DriverDutyStatus.off_duty

    _audit(db, order, "reconcile", previous, order.status.value, actor=actor)
    return ActionResult(order, note)


def close_order(db: Session, order: Order, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, OrderStatus.reconciled)
    previous = order.status.value
    order.status = OrderStatus.closed
    _audit(db, order, "close", previous, order.status.value, actor=actor)

    # Phase 8 — closing an order is the revenue-share trigger: post the
    # inbound customer-payment / outbound station-payout transaction pair.
    # A no-op (returns []) if the product has no price configured yet, so
    # an undefined price per liter never silently posts a wrong amount.
    note = "Order closed."
    posted = finance_service.generate_order_transactions(db, order, actor=actor)
    if posted:
        note = "Order closed; revenue-share transactions posted."
    return ActionResult(order, note)


CANCELLABLE_STATES = {
    OrderStatus.submitted,
    OrderStatus.awaiting_authorization,
    OrderStatus.authorized,
    OrderStatus.dispatched,
}


def cancel(db: Session, order: Order, reason: str, actor: str = "Operations Manager (demo role)") -> ActionResult:
    _require_status(order, *CANCELLABLE_STATES)
    previous = order.status.value
    order.status = OrderStatus.cancelled
    order.exception_details = reason
    if order.tanker_id:
        tanker = db.get(Tanker, order.tanker_id)
        if tanker:
            tanker.status = TankerStatus.idle
    _audit(db, order, "cancel", previous, order.status.value, reason, actor=actor)
    return ActionResult(order, "Order cancelled.")
