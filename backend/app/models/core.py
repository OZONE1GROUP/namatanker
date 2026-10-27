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
