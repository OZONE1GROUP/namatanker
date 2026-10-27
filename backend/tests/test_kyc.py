"""
Phase 9 — driver & vehicle registration + KYC validity tracking.

Scope confirmed with the operator for this build:
  - Driver KYC = driving license + civil/resident ID, each with its own
    expiry date. Vehicle KYC = registration (Istimara) + insurance, each
    with its own expiry date.
  - A driver or tanker with ANY expired KYC document is hard-blocked from
    being assigned to a new order (server-side, not just a frontend
    warning).
  - Expiring (within 30 days) / expired KYC documents raise entries in the
    Alerts & Exceptions module: "warning" near expiry, "critical" once
    expired, auto-resolved once renewed.

The seeded demo dataset deliberately includes a few drivers/tankers with
expired or soon-to-expire documents (TNK-002/007/015/020,
DRV-003/009/014/018) specifically so these rules have something real to
exercise — see app/seed.py.
"""
from datetime import date, timedelta

from app.services import kyc as kyc_service


def _get_tanker(client, headers, tanker_code):
    tankers = client.get("/api/tankers", headers=headers).json()
    return next(t for t in tankers if t["tanker_code"] == tanker_code)


def _get_driver(client, headers, driver_code):
    drivers = client.get("/api/drivers", headers=headers).json()
    return next(d for d in drivers if d["driver_code"] == driver_code)


# --- kyc_status()/driver_kyc()/tanker_kyc() unit-level classification ---

def test_kyc_status_classification():
    today = date(2026, 1, 1)
    assert kyc_service.kyc_status(None, today) == "missing"
    assert kyc_service.kyc_status(today - timedelta(days=1), today) == "expired"
    assert kyc_service.kyc_status(today + timedelta(days=10), today) == "expiring_soon"
    assert kyc_service.kyc_status(today + timedelta(days=30), today) == "expiring_soon"
    assert kyc_service.kyc_status(today + timedelta(days=31), today) == "valid"


# --- Fleet list/detail responses carry KYC status ---

def test_tanker_list_surfaces_kyc_status(client, operator_headers):
    expired = _get_tanker(client, operator_headers, "TNK-002")
    assert expired["kyc_status"] == "expired"

    valid = _get_tanker(client, operator_headers, "TNK-003")
    assert valid["kyc_status"] in ("valid", "expiring_soon")


def test_tanker_detail_includes_kyc_breakdown(client, operator_headers):
    tankers = client.get("/api/tankers", headers=operator_headers).json()
    tnk002 = next(t for t in tankers if t["tanker_code"] == "TNK-002")
    detail = client.get(f"/api/tankers/{tnk002['id']}", headers=operator_headers).json()
    assert detail["kyc"]["registration_status"] == "expired"
    assert detail["kyc"]["overall_status"] == "expired"


def test_driver_list_surfaces_kyc_status(client, operator_headers):
    expired = _get_driver(client, operator_headers, "DRV-018")
    assert expired["kyc"]["civil_id_status"] == "expired"
    assert expired["kyc"]["overall_status"] == "expired"

    expiring = _get_driver(client, operator_headers, "DRV-009")
    assert expiring["kyc"]["civil_id_status"] == "expiring_soon"


# --- Registration endpoints: RBAC ---

def test_non_fleet_roles_cannot_register_tanker_or_driver(client, operator_headers, auditor_headers, authorizer_headers):
    tanker_payload = {
        "registration_number": "OM-99901",
        "registration_expiry": "2030-01-01",
        "insurance_number": "INS-99901",
        "insurance_expiry": "2030-01-01",
        "capacity_l": 25000,
        "assigned_product": "diesel",
    }
    driver_payload = {
        "display_name": "Test Driver",
        "civil_id_number": "12345678",
        "civil_id_expiry": "2030-01-01",
        "license_number": "DL-999901",
        "license_expiry": "2030-01-01",
    }
    for headers in (operator_headers, auditor_headers, authorizer_headers):
        res = client.post("/api/tankers", headers=headers, json=tanker_payload)
        assert res.status_code == 403, res.text
        res = client.post("/api/drivers", headers=headers, json=driver_payload)
        assert res.status_code == 403, res.text


def test_fleet_manager_can_register_tanker(client, fleet_manager_headers):
    res = client.post(
        "/api/tankers",
        headers=fleet_manager_headers,
        json={
            "registration_number": "OM-12399",
            "registration_expiry": "2029-06-01",
            "insurance_number": "INS-12399",
            "insurance_expiry": "2029-06-01",
            "capacity_l": 30000,
            "assigned_product": "diesel",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["registration_number"] == "OM-12399"
    assert body["status"] == "idle"
    assert body["kyc"]["overall_status"] == "valid"

    # Persisted — shows up in the list.
    tankers = client.get("/api/tankers", headers=fleet_manager_headers).json()
    assert any(t["tanker_code"] == body["tanker_code"] for t in tankers)


def test_admin_can_register_driver(client, admin_headers):
    res = client.post(
        "/api/drivers",
        headers=admin_headers,
        json={
            "display_name": "Zayed Al-Harthy",
            "civil_id_number": "87654321",
            "civil_id_expiry": "2029-06-01",
            "license_number": "DL-765432",
            "license_expiry": "2029-06-01",
        },
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["display_name"] == "Zayed Al-Harthy"
    assert body["kyc"]["overall_status"] == "valid"


def test_unknown_product_rejected_on_tanker_registration(client, fleet_manager_headers):
    res = client.post(
        "/api/tankers",
        headers=fleet_manager_headers,
        json={
            "registration_number": "OM-00000",
            "registration_expiry": "2029-06-01",
            "insurance_number": "INS-00000",
            "insurance_expiry": "2029-06-01",
            "capacity_l": 20000,
            "assigned_product": "unobtainium",
        },
    )
    assert res.status_code == 400


# --- Hard block on assignment when KYC is expired ---

def test_assignment_blocked_for_tanker_with_expired_registration(client, operator_headers):
    customer = client.get("/api/customers", headers=operator_headers).json()[0]
    stations = client.get("/api/stations", headers=operator_headers).json()
    station = next(
        s for s in stations
        if any(b["status"] == "idle" for b in client.get(f"/api/stations/{s['id']}", headers=operator_headers).json()["loading_bays"])
    )
    tanker = _get_tanker(client, operator_headers, "TNK-002")  # deliberately expired registration
    assert tanker["kyc_status"] == "expired"

    res = client.post(
        "/api/orders",
        headers=operator_headers,
        json={"customer_id": customer["id"], "station_id": station["id"], "product": tanker["assigned_product"], "requested_quantity_l": 5000},
    )
    assert res.status_code == 201, res.text
    order_id = res.json()["id"]

    res = client.post(f"/api/orders/{order_id}/assign", headers=operator_headers, json={"tanker_id": tanker["id"]})
    assert res.status_code == 409, res.text
    assert "registration expired" in res.json()["detail"]


def test_assignment_blocked_for_driver_with_expired_civil_id(client, operator_headers):
    # DRV-018 has an expired civil ID; find an idle tanker compatible with
    # some product and attempt to assign both the tanker and this driver.
    tankers = client.get("/api/tankers", headers=operator_headers).json()
    idle_valid_tanker = next(t for t in tankers if t["status"] == "idle" and t["kyc_status"] != "expired")
    driver = _get_driver(client, operator_headers, "DRV-018")
    assert driver["kyc"]["overall_status"] == "expired"

    customer = client.get("/api/customers", headers=operator_headers).json()[0]
    stations = client.get("/api/stations", headers=operator_headers).json()
    station = next(
        s for s in stations
        if any(b["status"] == "idle" for b in client.get(f"/api/stations/{s['id']}", headers=operator_headers).json()["loading_bays"])
    )
    res = client.post(
        "/api/orders",
        headers=operator_headers,
        json={"customer_id": customer["id"], "station_id": station["id"], "product": idle_valid_tanker["assigned_product"], "requested_quantity_l": 5000},
    )
    assert res.status_code == 201, res.text
    order_id = res.json()["id"]

    res = client.post(
        f"/api/orders/{order_id}/assign",
        headers=operator_headers,
        json={"tanker_id": idle_valid_tanker["id"], "driver_id": driver["id"]},
    )
    assert res.status_code == 409, res.text
    assert "Civil ID expired" in res.json()["detail"]


# --- KYC compliance alerts ---

def test_seeded_expired_documents_raise_compliance_alerts(client, admin_headers):
    res = client.get("/api/alerts?page_size=200", headers=admin_headers)
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    kyc_alerts = [a for a in items if a["source"] == "KYC Compliance Monitor"]
    assert len(kyc_alerts) >= 4  # at least the 4 deliberately-expired seeded documents

    titles = {a["title"] for a in kyc_alerts}
    assert "Vehicle Registration compliance" in titles
    assert "Driver Civil ID compliance" in titles

    critical = [a for a in kyc_alerts if a["severity"] == "critical"]
    assert any(a["related_tanker_code"] == "TNK-002" for a in critical)
    assert any(a["related_driver_name"] for a in critical)


def test_check_kyc_alerts_upgrades_severity_and_is_idempotent(client, admin_headers):
    from app.database import SessionLocal
    from app.models.core import Driver

    db = SessionLocal()
    try:
        driver = db.query(Driver).filter(Driver.driver_code == "DRV-009").one()  # expiring-soon civil ID
        assert driver.civil_id_expiry > date.today()

        # First pass (already run at seed time) should have produced exactly
        # one open "warning" alert for this document — re-running must not
        # duplicate it.
        before = kyc_service.check_kyc_alerts(db)
        db.commit()
        assert not any(a.related_driver_id == driver.id for a in before)  # no new alert — already open

        # Expire the document and re-run: the existing alert should be
        # upgraded in place to critical, not duplicated.
        driver.civil_id_expiry = date.today() - timedelta(days=1)
        db.add(driver)
        db.commit()
        kyc_service.check_kyc_alerts(db)
        db.commit()

        from app.models.core import Alert
        from app.models.enums import AlertStatus

        alerts = db.query(Alert).filter(
            Alert.title == "Driver Civil ID compliance",
            Alert.related_driver_id == driver.id,
            Alert.status != AlertStatus.resolved,
        ).all()
        assert len(alerts) == 1
        assert alerts[0].severity.value == "critical"
    finally:
        db.close()


def test_check_kyc_alerts_auto_resolves_when_renewed():
    from app.database import SessionLocal
    from app.models.core import Alert, Driver
    from app.models.enums import AlertStatus

    db = SessionLocal()
    try:
        driver = db.query(Driver).filter(Driver.driver_code == "DRV-018").one()  # expired civil ID
        open_before = db.query(Alert).filter(
            Alert.title == "Driver Civil ID compliance",
            Alert.related_driver_id == driver.id,
            Alert.status == AlertStatus.open,
        ).count()
        assert open_before == 1

        driver.civil_id_expiry = date.today() + timedelta(days=365)
        db.add(driver)
        db.commit()
        kyc_service.check_kyc_alerts(db)
        db.commit()

        resolved = db.query(Alert).filter(
            Alert.title == "Driver Civil ID compliance",
            Alert.related_driver_id == driver.id,
        ).all()
        assert all(a.status == AlertStatus.resolved for a in resolved)
    finally:
        db.close()
