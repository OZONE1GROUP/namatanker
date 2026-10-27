"""
Core relational entities for Phase 1 + 2 (spec section 23).
Keeps business transactions separate from telemetry/audit tables
(those are added in later phases as TelemetryReading, OperationalEvent, etc.)
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.enums import (
    AlertSeverity,
    AlertStatus,
    AuthorizationStatus,
    ConnectivityStatus,
    DriverDutyStatus,
    LoadingBayStatus,
    OrderStatus,
    Product,
    TankerStatus,
    TransactionCategory,
    TransactionType,
    UserRole,
)


def _uuid() -> str:
    return str(uuid.uuid4())


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(200))
    customer_code: Mapped[str] = mapped_column(String(32), unique=True)
    contact_name: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="customer")


class Station(Base):
    __tablename__ = "stations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    station_code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    location: Mapped[str] = mapped_column(String(200))
    loading_bay_count: Mapped[int] = mapped_column(default=2)
    connectivity_status: Mapped[ConnectivityStatus] = mapped_column(
        Enum(ConnectivityStatus, name="connectivity_status"), default=ConnectivityStatus.online
    )
    last_heartbeat: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    edge_gateway_id: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="station")
    loading_bays: Mapped[list["LoadingBay"]] = relationship(back_populates="station")


class LoadingBay(Base):
    __tablename__ = "loading_bays"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("stations.id"))
    bay_code: Mapped[str] = mapped_column(String(16))
    status: Mapped[LoadingBayStatus] = mapped_column(
        Enum(LoadingBayStatus, name="loading_bay_status"), default=LoadingBayStatus.idle
    )
    # Which order currently occupies this bay is derived from Order.loading_bay_id
    # (not stored here too) to avoid a circular FK between loading_bays <-> orders.

    station: Mapped["Station"] = relationship(back_populates="loading_bays")


class Tanker(Base):
    __tablename__ = "tankers"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    tanker_code: Mapped[str] = mapped_column(String(32), unique=True)
    registration_number: Mapped[str] = mapped_column(String(32))
    capacity_l: Mapped[int] = mapped_column()
    assigned_product: Mapped[Product] = mapped_column(Enum(Product, name="product"))
    status: Mapped[TankerStatus] = mapped_column(Enum(TankerStatus, name="tanker_status"), default=TankerStatus.idle)
    gps_signal_ok: Mapped[bool] = mapped_column(default=True)
    last_lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    last_lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    last_comm_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    orders: Mapped[list["Order"]] = relationship(back_populates="tanker")
    driver: Mapped["Driver | None"] = relationship(back_populates="tanker", uselist=False)


class Driver(Base):
    __tablename__ = "drivers"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    driver_code: Mapped[str] = mapped_column(String(32), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    duty_status: Mapped[DriverDutyStatus] = mapped_column(
        Enum(DriverDutyStatus, name="driver_duty_status"), default=DriverDutyStatus.off_duty
    )
    qualification_status: Mapped[str] = mapped_column(String(64), default="Certified")
    assigned_tanker_id: Mapped[str | None] = mapped_column(
        UUID(as_uuid=False), ForeignKey("tankers.id"), unique=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tanker: Mapped["Tanker | None"] = relationship(back_populates="driver")


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_number: Mapped[str] = mapped_column(String(32), unique=True)
    customer_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("customers.id"))
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("stations.id"))
    tanker_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("tankers.id"))
    driver_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("drivers.id"))
    loading_bay_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("loading_bays.id"))

    product: Mapped[Product] = mapped_column(Enum(Product, name="product"))
    requested_quantity_l: Mapped[int] = mapped_column()
    authorized_quantity_l: Mapped[int | None] = mapped_column()
    actual_loaded_quantity_l: Mapped[int | None] = mapped_column()
    delivery_quantity_l: Mapped[int | None] = mapped_column()

    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus, name="order_status"), default=OrderStatus.draft)
    authorization_reference: Mapped[str | None] = mapped_column(String(64))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    exception_details: Mapped[str | None] = mapped_column(Text)

    customer: Mapped["Customer"] = relationship(back_populates="orders")
    station: Mapped["Station"] = relationship(back_populates="orders")
    tanker: Mapped["Tanker | None"] = relationship(back_populates="orders")
    authorization: Mapped["Authorization | None"] = relationship(
        back_populates="order", uselist=False
    )


class Authorization(Base):
    """
    Loading authorization record (spec section 13). In SIMULATION MODE this
    is a clearly-labeled test implementation that demonstrates the issue/
    verify lifecycle — it never represents a production cryptographic
    authorization and is not wired to any physical equipment.
    """

    __tablename__ = "authorizations"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    order_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"), unique=True)
    station_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("stations.id"))
    tanker_id: Mapped[str] = mapped_column(UUID(as_uuid=False), ForeignKey("tankers.id"))
    driver_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("drivers.id"))

    max_authorized_quantity_l: Mapped[int] = mapped_column()
    status: Mapped[AuthorizationStatus] = mapped_column(
        Enum(AuthorizationStatus, name="authorization_status"), default=AuthorizationStatus.valid
    )
    issuing_service: Mapped[str] = mapped_column(String(64), default="Authorization Service (SIM test signer)")
    correlation_id: Mapped[str] = mapped_column(String(64))
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verification_result: Mapped[str | None] = mapped_column(String(64))

    order: Mapped["Order"] = relationship(back_populates="authorization")


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    severity: Mapped[AlertSeverity] = mapped_column(Enum(AlertSeverity, name="alert_severity"))
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus, name="alert_status"), default=AlertStatus.open)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(100))
    related_order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"))
    related_station_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("stations.id"))
    recommended_action: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AuditEntry(Base):
    __tablename__ = "audit_entries"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    actor: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(120))
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(64))
    previous_state: Mapped[str | None] = mapped_column(Text)
    new_state: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    correlation_id: Mapped[str | None] = mapped_column(String(64))


class User(Base):
    """
    Phase 7 — demo authentication accounts. SIMULATION MODE: these are
    synthetic demo accounts seeded by app/seed.py for the purpose of
    demonstrating role-based access control in this simulator, not a
    production identity store (no SSO/MFA/password-reset flows).
    """

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, name="user_role"))
    password_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SimulationSettings(Base):
    """Singleton row holding the simulation clock state."""

    __tablename__ = "simulation_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    simulation_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    speed_multiplier: Mapped[int] = mapped_column(default=1)
    is_paused: Mapped[bool] = mapped_column(default=False)
    mode: Mapped[str] = mapped_column(String(32), default="SIMULATION")


class ProductPricing(Base):
    """
    Phase 8 — price per liter configured per Product. The id is the
    product's own enum value (one row per product, upserted rather than
    multiplied), so "which product" and "which row" are never out of sync.
    """

    __tablename__ = "product_pricing"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    product: Mapped[Product] = mapped_column(Enum(Product, name="pricing_product"), unique=True)
    price_per_liter: Mapped[float] = mapped_column(Numeric(10, 4))
    currency: Mapped[str] = mapped_column(String(8), default="OMR")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PlatformSettings(Base):
    """
    Phase 8 — singleton row for the platform's revenue-share commission
    percentage and its (SIMULATION MODE) payment gateway configuration.
    No real payment credentials are ever stored here — this is a demo
    toggle/config surface, consistent with the rest of this simulator.
    """

    __tablename__ = "platform_settings"

    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    commission_model: Mapped[str] = mapped_column(String(32), default="revenue_share")
    platform_commission_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=12.50)
    payment_gateway_enabled: Mapped[bool] = mapped_column(default=False)
    payment_gateway_provider: Mapped[str | None] = mapped_column(String(64))
    payment_gateway_mode: Mapped[str] = mapped_column(String(16), default="test")
    payment_gateway_reference: Mapped[str | None] = mapped_column(String(120))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Transaction(Base):
    """
    Phase 8 — finance ledger. Two rows are auto-generated the moment an
    order is closed (see app/services/finance.py): an inbound
    customer_payment for the full order value, and an outbound
    station_payout for that value minus the platform's commission —
    the platform's own retained revenue is the difference between the two,
    derivable rather than stored as a third row. SIMULATION MODE: these
    are synthetic ledger entries; no real money moves.
    """

    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=_uuid)
    transaction_number: Mapped[str] = mapped_column(String(32), unique=True)
    order_id: Mapped[str | None] = mapped_column(UUID(as_uuid=False), ForeignKey("orders.id"))

    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType, name="transaction_type"))
    category: Mapped[TransactionCategory] = mapped_column(Enum(TransactionCategory, name="transaction_category"))
    amount: Mapped[float] = mapped_column(Numeric(12, 3))
    currency: Mapped[str] = mapped_column(String(8), default="OMR")

    counterparty_type: Mapped[str] = mapped_column(String(32))
    counterparty_name: Mapped[str] = mapped_column(String(200))

    # Breakdown fields — populated on the customer_payment/station_payout pair
    # so the commission allocation of each transaction can be reported
    # without re-joining the opposite leg.
    commission_pct: Mapped[float | None] = mapped_column(Numeric(5, 2))
    commission_amount: Mapped[float | None] = mapped_column(Numeric(12, 3))
    net_amount: Mapped[float | None] = mapped_column(Numeric(12, 3))

    payment_method: Mapped[str] = mapped_column(String(32), default="internal_ledger")
    status: Mapped[str] = mapped_column(String(32), default="completed")
    description: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order | None"] = relationship()
