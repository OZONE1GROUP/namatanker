"""
Deterministic seed data generator (spec sections 22/26).

Run with:  python -m app.seed
Creates tables if missing, then wipes and repopulates demo data so the
Executive Overview dashboard has ~7 days of realistic, related records.
Uses a fixed random seed so repeated runs produce the same demonstration
dataset (the spec calls for stable seeded demo data as the default, with
randomized scenarios as a later, separate option).
"""
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete

from app.database import Base, SessionLocal, engine
from app.models.core import (
    Alert,
    AuditEntry,
    Authorization,
    Customer,
    Driver,
    LoadingBay,
    Order,
    PlatformSettings,
    ProductPricing,
    SimulationSettings,
    Station,
    Tanker,
    Transaction,
    User,
)
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
from app.security import hash_password
from app.services import finance as finance_service
from app.services import kyc as kyc_service

# Phase 7 demo accounts — every seeded user shares this password so the
# login page can show it directly next to each role (SIMULATION MODE: a
# synthetic demo credential, never a real secret).
DEMO_PASSWORD = "demo123"

DEMO_USERS = [
    ("operator1", "Fahad Al-Harthy", UserRole.operator),
    ("authorizer1", "Hilal Al-Rawahi", UserRole.authorization_officer),
    ("fleetmgr1", "Noor Al-Balushi", UserRole.fleet_manager),
    ("auditor1", "Mariam Al-Kindi", UserRole.auditor),
    ("admin1", "Talal Al-Farsi", UserRole.admin),
]

RNG_SEED = 20261026

STATIONS = [
    ("STN-MCT", "Muscat Terminal", "Mina Al Fahal, Muscat"),
    ("STN-SOH", "Sohar Distribution Hub", "Sohar Industrial Port"),
    ("STN-SUR", "Sur Coastal Terminal", "Sur, South Sharqiyah"),
    ("STN-NIZ", "Nizwa Inland Depot", "Nizwa, Ad Dakhiliyah"),
    ("STN-SAL", "Salalah Export Terminal", "Salalah Port, Dhofar"),
]

CUSTOMERS = [
    ("National Fuel Distribution Co.", "CUST-001"),
    ("Gulf Horizon Logistics", "CUST-002"),
    ("Al Bahja Petroleum Trading", "CUST-003"),
    ("Dhofar Energy Services", "CUST-004"),
    ("Sohar Industrial Supplies", "CUST-005"),
    ("Falcon Transport & Fuels", "CUST-006"),
    ("Oman Marine Bunkering LLC", "CUST-007"),
    ("Al Masirah Fuel Retail", "CUST-008"),
]

FIRST_NAMES = [
    "Said", "Khalid", "Ahmed", "Yousuf", "Hamed", "Salim", "Rashid", "Nasser",
    "Mohammed", "Talal", "Sultan", "Badr", "Fahad", "Ali", "Hilal",
]
LAST_NAMES = [
    "Al-Harthy", "Al-Balushi", "Al-Habsi", "Al-Rawahi", "Al-Siyabi", "Al-Kindi",
    "Al-Maskari", "Al-Hinai", "Al-Lawati", "Al-Farsi",
]

PRODUCTS = list(Product)


def wipe(db):
    # Order matters: children before parents, to satisfy foreign keys.
    for model in [
        AuditEntry,
        Alert,
        Transaction,
        Authorization,
        Order,
        LoadingBay,
        Driver,
        Tanker,
        Station,
        Customer,
        SimulationSettings,
        PlatformSettings,
        ProductPricing,
        User,
    ]:
        db.execute(delete(model))
    db.commit()


def seed():
    # Re-seed on every call (not just once at import time) so repeated
    # reseeds — including the test suite's autouse per-test reseed — always
    # reproduce the exact same dataset, independent of how many times
    # seed() has already run in this process. Phase 9's KYC dates use a
    # separate RNG instance so adding them never shifts the sequence of
    # `random.*` calls the rest of this dataset (station/tanker/driver
    # attributes, order generation, etc.) already depends on for its exact,
    # previously-tested shape.
    random.seed(RNG_SEED)
    kyc_rng = random.Random(RNG_SEED + 1)

    # Phase 1/2 have no migration tooling yet (Alembic is installed and ready
    # for Phase 3+): drop_all + create_all keeps the dev schema in sync with
    # the models on every reseed. This is a SIMULATION-MODE dev database only.
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        wipe(db)
        now = datetime.now(timezone.utc)

        # --- Stations ---
        stations = []
        for i, (code, name, location) in enumerate(STATIONS):
            # Keep most online; one degraded, one offline for a realistic mix.
            status = ConnectivityStatus.online
            if i == 3:
                status = ConnectivityStatus.degraded
            if i == 4:
                status = ConnectivityStatus.offline
            s = Station(
                station_code=code,
                name=name,
                location=location,
                loading_bay_count=random.choice([2, 3, 4]),
                connectivity_status=status,
                last_heartbeat=now - timedelta(minutes=random.randint(1, 240)),
                edge_gateway_id=f"EDGE-{code}",
            )
            stations.append(s)
        db.add_all(stations)
        db.flush()

        # --- Loading bays (one row per bay per station) ---
        loading_bays: list[LoadingBay] = []
        bays_by_station: dict[str, list[LoadingBay]] = {}
        for s in stations:
            station_bays = []
            for b in range(1, s.loading_bay_count + 1):
                bay = LoadingBay(
                    station_id=s.id,
                    bay_code=f"BAY-{b}",
                    status=LoadingBayStatus.maintenance if s.connectivity_status == ConnectivityStatus.offline else LoadingBayStatus.idle,
                )
                loading_bays.append(bay)
                station_bays.append(bay)
            bays_by_station[s.id] = station_bays
        db.add_all(loading_bays)
        db.flush()

        # --- Customers ---
        customers = [Customer(name=n, customer_code=c, contact_name=random.choice(FIRST_NAMES) + " " + random.choice(LAST_NAMES)) for n, c in CUSTOMERS]
        db.add_all(customers)
        db.flush()

        # --- Tankers (25, within 10-50 pilot target) ---
        # Phase 9 — vehicle KYC (registration/Istimara + insurance, each with
        # its own expiry). SIMULATION MODE: synthetic document numbers only.
        # A handful of tankers are deliberately seeded expired/expiring soon
        # so the KYC-blocking rule and the compliance alerts have something
        # real to demonstrate.
        today = now.date()
        TANKER_REG_EXPIRED = {2}
        TANKER_INS_EXPIRED = {20}
        TANKER_REG_EXPIRING_SOON = {15}
        TANKER_INS_EXPIRING_SOON = {7}

        tankers = []
        for i in range(1, 26):
            code = f"TNK-{i:03d}"
            if i in TANKER_REG_EXPIRED:
                registration_expiry = today - timedelta(days=12)
            elif i in TANKER_REG_EXPIRING_SOON:
                registration_expiry = today + timedelta(days=20)
            else:
                registration_expiry = today + timedelta(days=kyc_rng.randint(120, 730))

            if i in TANKER_INS_EXPIRED:
                insurance_expiry = today - timedelta(days=3)
            elif i in TANKER_INS_EXPIRING_SOON:
                insurance_expiry = today + timedelta(days=9)
            else:
                insurance_expiry = today + timedelta(days=kyc_rng.randint(120, 730))

            t = Tanker(
                tanker_code=code,
                registration_number=f"OM-{random.randint(10000, 99999)}",
                registration_expiry=registration_expiry,
                insurance_number=f"INS-{kyc_rng.randint(100000, 999999)}",
                insurance_expiry=insurance_expiry,
                capacity_l=random.choice([20000, 25000, 30000, 36000]),
                assigned_product=random.choice(PRODUCTS),
                status=TankerStatus.idle,
                gps_signal_ok=True,
                last_lat=23.5880 + random.uniform(-2.0, 2.0),
                last_lon=58.3829 + random.uniform(-2.5, 2.0),
                last_comm_at=now - timedelta(minutes=random.randint(1, 60)),
            )
            tankers.append(t)
        db.add_all(tankers)
        db.flush()

        # --- Drivers (one per ~first 20 tankers, a few spare) ---
        # Phase 9 — driver KYC (driving license + civil/resident ID, each
        # with its own expiry). SIMULATION MODE: synthetic document numbers.
        DRIVER_LICENSE_EXPIRED = {3}
        DRIVER_CIVIL_ID_EXPIRED = {18}
        DRIVER_LICENSE_EXPIRING_SOON = {14}
        DRIVER_CIVIL_ID_EXPIRING_SOON = {9}

        drivers = []
        for i in range(1, 23):
            if i in DRIVER_CIVIL_ID_EXPIRED:
                civil_id_expiry = today - timedelta(days=2)
            elif i in DRIVER_CIVIL_ID_EXPIRING_SOON:
                civil_id_expiry = today + timedelta(days=18)
            else:
                civil_id_expiry = today + timedelta(days=kyc_rng.randint(180, 900))

            if i in DRIVER_LICENSE_EXPIRED:
                license_expiry = today - timedelta(days=15)
            elif i in DRIVER_LICENSE_EXPIRING_SOON:
                license_expiry = today + timedelta(days=5)
            else:
                license_expiry = today + timedelta(days=kyc_rng.randint(180, 900))

            d = Driver(
                driver_code=f"DRV-{i:03d}",
                display_name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
                duty_status=DriverDutyStatus.off_duty,
                qualification_status=random.choice(["Certified", "Certified", "Certified", "Renewal Due"]),
                assigned_tanker_id=tankers[i - 1].id if i <= len(tankers) else None,
                civil_id_number=f"{kyc_rng.randint(10000000, 99999999)}",
                civil_id_expiry=civil_id_expiry,
                license_number=f"DL-{kyc_rng.randint(100000, 999999)}",
                license_expiry=license_expiry,
            )
            drivers.append(d)
        db.add_all(drivers)
        db.flush()

        # --- Phase 8: price per liter per product + revenue-share settings ---
        pricing_rows = [
            ProductPricing(id=product.value, product=product, price_per_liter=price)
            for product, price in finance_service.DEFAULT_PRICING_OMR.items()
        ]
        db.add_all(pricing_rows)
        db.add(
            PlatformSettings(
                id=1,
                commission_model="revenue_share",
                platform_commission_pct=finance_service.DEFAULT_COMMISSION_PCT,
                payment_gateway_enabled=False,
                payment_gateway_provider=None,
                payment_gateway_mode="test",
                payment_gateway_reference=None,
            )
        )
        db.flush()

        # --- Orders across the last 7 days ---
        # Weighted distribution across the lifecycle so KPIs look like a live
        # operation: mostly completed/in-flight, a realistic slice of
        # exceptions, and a handful actively loading right now.
        status_weights: list[tuple[OrderStatus, int]] = [
            (OrderStatus.awaiting_authorization, 6),
            (OrderStatus.authorized, 5),
            (OrderStatus.dispatched, 4),
            (OrderStatus.loading_in_progress, 4),
            (OrderStatus.in_transit, 8),
            (OrderStatus.delivery_completed, 10),
            (OrderStatus.reconciliation_pending, 6),
            (OrderStatus.reconciled, 22),
            (OrderStatus.closed, 18),
            (OrderStatus.rejected, 2),
            (OrderStatus.cancelled, 2),
            (OrderStatus.expired_authorization, 2),
            (OrderStatus.meter_discrepancy, 3),
            (OrderStatus.failed_reconciliation, 2),
        ]
        pool: list[OrderStatus] = []
        for status, weight in status_weights:
            pool.extend([status] * weight)

        orders = []
        authorizations: list[Authorization] = []
        order_seq = 1
        AT_BAY_STATES = {
            OrderStatus.loading_initiated,
            OrderStatus.loading_in_progress,
            OrderStatus.loading_completed,
        }
        for day_offset in range(6, -1, -1):  # 6 days ago .. today
            day_start = now - timedelta(days=day_offset)
            orders_today = random.randint(10, 16)
            for _ in range(orders_today):
                status = random.choice(pool)
                station = random.choice(stations)
                customer = random.choice(customers)
                product = random.choice(PRODUCTS)
                requested = random.choice([8000, 12000, 16000, 20000, 24000])
                created_at = day_start.replace(
                    hour=random.randint(5, 20), minute=random.randint(0, 59)
                )

                authorized_qty = None
                actual_loaded = None
                delivery_qty = None
                authorized_at = None
                loaded_at = None
                delivered_at = None
                tanker = random.choice(tankers)
                driver = next((d for d in drivers if d.assigned_tanker_id == tanker.id), None)

                progressed_states = {
                    OrderStatus.authorized, OrderStatus.dispatched, OrderStatus.arrived_at_station,
                    OrderStatus.loading_initiated, OrderStatus.loading_in_progress, OrderStatus.loading_completed,
                    OrderStatus.in_transit, OrderStatus.delivery_completed, OrderStatus.reconciliation_pending,
                    OrderStatus.reconciled, OrderStatus.closed, OrderStatus.meter_discrepancy,
                    OrderStatus.failed_reconciliation,
                }
                if status in progressed_states:
                    authorized_qty = requested
                    authorized_at = created_at + timedelta(minutes=random.randint(5, 30))

                loaded_states = {
                    OrderStatus.loading_completed, OrderStatus.in_transit, OrderStatus.delivery_completed,
                    OrderStatus.reconciliation_pending, OrderStatus.reconciled, OrderStatus.closed,
                    OrderStatus.meter_discrepancy, OrderStatus.failed_reconciliation,
                }
                if status in loaded_states:
                    variance = 0 if status not in (OrderStatus.meter_discrepancy, OrderStatus.failed_reconciliation) else random.randint(150, 600)
                    actual_loaded = requested - variance if random.random() > 0.5 else requested + variance
                    loaded_at = authorized_at + timedelta(minutes=random.randint(20, 70))

                delivered_states = {
                    OrderStatus.delivery_completed, OrderStatus.reconciliation_pending,
                    OrderStatus.reconciled, OrderStatus.closed,
                }
                if status in delivered_states:
                    delivery_qty = actual_loaded
                    delivered_at = loaded_at + timedelta(hours=random.randint(1, 6))

                exception_details = None
                if status == OrderStatus.meter_discrepancy:
                    exception_details = "Meter reading variance exceeded tolerance band during loading."
                elif status == OrderStatus.failed_reconciliation:
                    exception_details = "Delivered quantity did not reconcile with authorized quantity within tolerance."
                elif status == OrderStatus.expired_authorization:
                    exception_details = "Authorization token expired before loading could commence."
                elif status == OrderStatus.rejected:
                    exception_details = "Authorization request rejected — quantity mismatch against order."

                station_bays = bays_by_station.get(station.id, [])
                bay = random.choice(station_bays) if (status in AT_BAY_STATES and station_bays) else None

                auth_ref = f"AUTH-{order_seq:06d}" if (authorized_qty or status in (OrderStatus.expired_authorization, OrderStatus.rejected)) else None

                order = Order(
                    order_number=f"ORD-{created_at.strftime('%y%m')}-{order_seq:05d}",
                    customer_id=customer.id,
                    station_id=station.id,
                    tanker_id=tanker.id if status != OrderStatus.draft else None,
                    driver_id=driver.id if (driver and status != OrderStatus.draft) else None,
                    loading_bay_id=bay.id if bay else None,
                    product=product,
                    requested_quantity_l=requested,
                    authorized_quantity_l=authorized_qty,
                    actual_loaded_quantity_l=actual_loaded,
                    delivery_quantity_l=delivery_qty,
                    status=status,
                    authorization_reference=auth_ref,
                    created_at=created_at,
                    authorized_at=authorized_at,
                    loaded_at=loaded_at,
                    delivered_at=delivered_at,
                    exception_details=exception_details,
                )
                orders.append(order)

                # One Authorization record per order that ever had an authorization
                # decision made — valid for the ones that progressed, expired/rejected
                # for the two exception paths that stop at that stage.
                if authorized_qty:
                    orders[-1]._pending_auth = Authorization(
                        station_id=station.id,
                        tanker_id=tanker.id,
                        driver_id=driver.id if driver else None,
                        max_authorized_quantity_l=authorized_qty,
                        status=AuthorizationStatus.valid,
                        correlation_id=f"CORR-{order_seq:06d}",
                        issued_at=authorized_at,
                        expires_at=authorized_at + timedelta(hours=4),
                    )
                elif status == OrderStatus.expired_authorization:
                    issued = created_at + timedelta(minutes=10)
                    orders[-1]._pending_auth = Authorization(
                        station_id=station.id,
                        tanker_id=tanker.id,
                        driver_id=driver.id if driver else None,
                        max_authorized_quantity_l=requested,
                        status=AuthorizationStatus.expired,
                        correlation_id=f"CORR-{order_seq:06d}",
                        issued_at=issued,
                        expires_at=issued + timedelta(minutes=30),
                    )
                elif status == OrderStatus.rejected:
                    issued = created_at + timedelta(minutes=10)
                    orders[-1]._pending_auth = Authorization(
                        station_id=station.id,
                        tanker_id=tanker.id,
                        driver_id=driver.id if driver else None,
                        max_authorized_quantity_l=requested,
                        status=AuthorizationStatus.rejected,
                        correlation_id=f"CORR-{order_seq:06d}",
                        issued_at=issued,
                        expires_at=issued + timedelta(hours=4),
                        verification_result="Quantity mismatch against order",
                    )
                else:
                    orders[-1]._pending_auth = None

                order_seq += 1

                # Reflect a few tankers/drivers as currently active for in-flight orders on "today"
                if day_offset == 0:
                    if status == OrderStatus.loading_in_progress:
                        tanker.status = TankerStatus.loading
                    elif status == OrderStatus.in_transit:
                        tanker.status = TankerStatus.in_transit
                    elif status in (OrderStatus.dispatched, OrderStatus.arrived_at_station):
                        tanker.status = TankerStatus.dispatched
                    if driver and status in (
                        OrderStatus.loading_in_progress, OrderStatus.in_transit,
                        OrderStatus.dispatched, OrderStatus.arrived_at_station,
                    ):
                        driver.duty_status = DriverDutyStatus.driving if status == OrderStatus.in_transit else DriverDutyStatus.at_station

        db.add_all(orders)
        db.flush()

        # Now that orders have IDs, attach the Authorization record each one earned.
        for order in orders:
            pending = getattr(order, "_pending_auth", None)
            if pending is not None:
                pending.order_id = order.id
                authorizations.append(pending)
        db.add_all(authorizations)

        # Mark bays currently occupied by a live loading order as "occupied".
        occupied_bay_ids = {o.loading_bay_id for o in orders if o.status == OrderStatus.loading_in_progress and o.loading_bay_id}
        for bay in loading_bays:
            if bay.id in occupied_bay_ids:
                bay.status = LoadingBayStatus.occupied

        db.flush()

        # --- Phase 8: post revenue-share transactions for every closed order ---
        transactions = []
        for order in orders:
            if order.status == OrderStatus.closed:
                transactions.extend(finance_service.generate_order_transactions(db, order, actor="system (seed)"))
        db.flush()

        # --- Alerts, tied to the exception orders above ---
        alerts = []
        offline_station = next(s for s in stations if s.connectivity_status == ConnectivityStatus.offline)
        alerts.append(
            Alert(
                severity=AlertSeverity.critical,
                status=AlertStatus.open,
                title="Station offline",
                description=f"{offline_station.name} has not sent a heartbeat within the expected interval.",
                source="Edge Gateway Monitor",
                related_station_id=offline_station.id,
                recommended_action="Dispatch field technician or verify VPN/router connectivity at the site.",
            )
        )
        degraded_station = next(s for s in stations if s.connectivity_status == ConnectivityStatus.degraded)
        alerts.append(
            Alert(
                severity=AlertSeverity.warning,
                status=AlertStatus.acknowledged,
                title="Gateway heartbeat irregular",
                description=f"{degraded_station.name} gateway heartbeat interval exceeds normal variance.",
                source="Edge Gateway Monitor",
                related_station_id=degraded_station.id,
                recommended_action="Monitor; escalate if the pattern continues past the next scenario cycle.",
                acknowledged_at=now - timedelta(minutes=40),
            )
        )
        for order in orders:
            if order.status in (OrderStatus.meter_discrepancy, OrderStatus.failed_reconciliation):
                alerts.append(
                    Alert(
                        severity=AlertSeverity.critical,
                        status=AlertStatus.open,
                        title="Meter discrepancy" if order.status == OrderStatus.meter_discrepancy else "Reconciliation failed",
                        description=order.exception_details or "",
                        source="Reconciliation Service",
                        related_order_id=order.id,
                        related_station_id=order.station_id,
                        recommended_action="Review meter log and authorized quantity before closing the order.",
                    )
                )
        db.add_all(alerts)
        db.flush()

        # --- Phase 9: KYC compliance alerts for the deliberately expired /
        # expiring-soon drivers and tankers seeded above ---
        kyc_alerts = kyc_service.check_kyc_alerts(db, today=today)
        alerts.extend(kyc_alerts)

        # --- Simulation clock ---
        db.add(SimulationSettings(id=1, simulation_time=now, speed_multiplier=1, is_paused=False, mode="SIMULATION"))

        # --- Phase 7 demo user accounts (one per role) ---
        password_hash = hash_password(DEMO_PASSWORD)
        users = [
            User(username=username, display_name=display_name, role=role, password_hash=password_hash)
            for username, display_name, role in DEMO_USERS
        ]
        db.add_all(users)

        # --- A few audit entries so the table isn't empty when Phase 2 reads it ---
        db.add(
            AuditEntry(
                actor="system",
                action="seed_data_loaded",
                entity_type="simulation",
                entity_id="global",
                new_state=f"{len(orders)} orders, {len(stations)} stations, {len(tankers)} tankers seeded",
                reason="Phase 1+2 demonstration dataset",
            )
        )

        db.commit()
        print(
            f"Seeded {len(stations)} stations ({len(loading_bays)} bays), {len(customers)} customers, "
            f"{len(tankers)} tankers, {len(drivers)} drivers, {len(orders)} orders "
            f"({len(authorizations)} authorizations), {len(alerts)} alerts ({len(kyc_alerts)} KYC compliance), "
            f"{len(users)} demo user accounts, {len(pricing_rows)} product prices, {len(transactions)} finance transactions."
        )
        print(f"Demo login — any username below with password '{DEMO_PASSWORD}':")
        for username, display_name, role in DEMO_USERS:
            print(f"  {username:<14} {role.value:<22} {display_name}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
