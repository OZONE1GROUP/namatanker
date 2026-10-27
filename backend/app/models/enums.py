"""Shared enumerations for the simulated domain model (spec section 8 / 23)."""
import enum


class OrderStatus(str, enum.Enum):
    draft = "draft"
    submitted = "submitted"
    validated = "validated"
    awaiting_authorization = "awaiting_authorization"
    authorized = "authorized"
    dispatched = "dispatched"
    arrived_at_station = "arrived_at_station"
    loading_initiated = "loading_initiated"
    loading_in_progress = "loading_in_progress"
    loading_completed = "loading_completed"
    in_transit = "in_transit"
    delivery_completed = "delivery_completed"
    reconciliation_pending = "reconciliation_pending"
    reconciled = "reconciled"
    closed = "closed"
    # Exception states
    rejected = "rejected"
    cancelled = "cancelled"
    expired_authorization = "expired_authorization"
    loading_interrupted = "loading_interrupted"
    meter_discrepancy = "meter_discrepancy"
    failed_reconciliation = "failed_reconciliation"


ACTIVE_LOADING_STATUSES = {
    OrderStatus.loading_initiated,
    OrderStatus.loading_in_progress,
}

IN_TRANSIT_STATUSES = {OrderStatus.in_transit}

COMPLETED_DELIVERY_STATUSES = {
    OrderStatus.delivery_completed,
    OrderStatus.reconciliation_pending,
    OrderStatus.reconciled,
    OrderStatus.closed,
}

RECONCILIATION_EXCEPTION_STATUSES = {
    OrderStatus.meter_discrepancy,
    OrderStatus.failed_reconciliation,
}


class TankerStatus(str, enum.Enum):
    idle = "idle"
    dispatched = "dispatched"
    at_station = "at_station"
    loading = "loading"
    in_transit = "in_transit"
    delivering = "delivering"
    returning = "returning"
    maintenance = "maintenance"
    offline = "offline"


class DriverDutyStatus(str, enum.Enum):
    off_duty = "off_duty"
    on_duty = "on_duty"
    driving = "driving"
    at_station = "at_station"
    on_break = "on_break"


class ConnectivityStatus(str, enum.Enum):
    online = "online"
    degraded = "degraded"
    offline = "offline"


class AlertSeverity(str, enum.Enum):
    info = "info"
    warning = "warning"
    critical = "critical"


class AlertStatus(str, enum.Enum):
    open = "open"
    acknowledged = "acknowledged"
    resolved = "resolved"
    escalated = "escalated"


class Product(str, enum.Enum):
    diesel = "diesel"
    petrol_91 = "petrol_91"
    petrol_95 = "petrol_95"
    jet_fuel = "jet_fuel"
    lpg = "lpg"


class AuthorizationStatus(str, enum.Enum):
    valid = "valid"
    expired = "expired"
    revoked = "revoked"
    rejected = "rejected"


class LoadingBayStatus(str, enum.Enum):
    idle = "idle"
    occupied = "occupied"
    maintenance = "maintenance"


class UserRole(str, enum.Enum):
    """
    Phase 7 — role-based access control (spec section 29/"Security & Polish").
    Five roles matching the real-world functions in a tanker-terminal
    operation; see app/routers/auth.py's demo-users list for the seeded
    account each role maps to.
    """

    operator = "operator"                        # Terminal Operator — day-to-day order/loading ops
    authorization_officer = "authorization_officer"  # issues/rejects loading authorizations
    fleet_manager = "fleet_manager"               # fleet, stations, edge-gateway connectivity
    auditor = "auditor"                           # read-only compliance/audit visibility
    admin = "admin"                               # full access incl. simulation clock controls


class TransactionType(str, enum.Enum):
    """
    Phase 8 — finance & revenue-share module. Every ledger row is either
    money coming into the platform (inbound, from the customer) or money
    going out of it (outbound, the revenue-share payout to the station).
    """

    inbound = "inbound"
    outbound = "outbound"


class TransactionCategory(str, enum.Enum):
    customer_payment = "customer_payment"      # inbound — full order value collected from the customer
    station_payout = "station_payout"          # outbound — order value minus platform commission
    refund = "refund"                           # outbound — reversal of a customer payment (not auto-generated)
    manual_adjustment = "manual_adjustment"      # either direction — admin-entered correction

