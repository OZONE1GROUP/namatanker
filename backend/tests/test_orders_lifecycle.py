"""
The order lifecycle state machine (app/services/orders.py) exercised
end-to-end through the real HTTP API — happy path to Closed, both
exception branches (meter discrepancy, failed reconciliation), an invalid
transition (409), a cancellation, and confirmation that each audit entry's
``actor`` is the real logged-in user's display name (the post-Phase-7
audit-actor-attribution fix), not the old generic placeholder string.
"""
from tests.conftest import (
    auth_headers,
    pick_customer,
    pick_idle_tanker_for_product,
    pick_station_with_bay,
)

PRODUCT = "diesel"
REQUESTED_QTY = 10_000


def _create_order(client, headers, product=PRODUCT, quantity=REQUESTED_QTY):
    customer = pick_customer(client, headers)
    station = pick_station_with_bay(client, headers)
    res = client.post(
        "/api/orders",
        headers=headers,
        json={
            "customer_id": customer["id"],
            "station_id": station["id"],
            "product": product,
            "requested_quantity_l": quantity,
        },
    )
    assert res.status_code == 201, res.text
    return res.json(), station


def _advance_to_loading(client, operator_headers, authorizer_headers, quantity=REQUESTED_QTY):
    """Create an order and drive it through to loading_in_progress. Returns (order, station)."""
    order, station = _create_order(client, operator_headers, quantity=quantity)
    order_id = order["id"]

    tanker = pick_idle_tanker_for_product(client, operator_headers, PRODUCT)
    res = client.post(
        f"/api/orders/{order_id}/assign",
        headers=operator_headers,
        json={"tanker_id": tanker["id"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["order"]["status"] == "awaiting_authorization"

    res = client.post(f"/api/orders/{order_id}/authorize", headers=authorizer_headers)
    assert res.status_code == 200, res.text
    assert res.json()["order"]["status"] == "authorized"

    res = client.post(f"/api/orders/{order_id}/dispatch", headers=operator_headers)
    assert res.status_code == 200
    assert res.json()["order"]["status"] == "dispatched"

    res = client.post(f"/api/orders/{order_id}/arrive-at-station", headers=operator_headers)
    assert res.status_code == 200
    assert res.json()["order"]["status"] == "arrived_at_station"

    idle_bay = next(b for b in station["loading_bays"] if b["status"] == "idle")
    res = client.post(
        f"/api/orders/{order_id}/start-loading",
        headers=operator_headers,
        json={"loading_bay_id": idle_bay["id"]},
    )
    assert res.status_code == 200, res.text
    order = res.json()["order"]
    assert order["status"] == "loading_in_progress"
    return order, station


def test_full_happy_path_to_closed(client, operator_headers, authorizer_headers):
    order, _station = _advance_to_loading(client, operator_headers, authorizer_headers)
    order_id = order["id"]

    res = client.post(
        f"/api/orders/{order_id}/complete-loading",
        headers=operator_headers,
        json={"actual_loaded_quantity_l": REQUESTED_QTY},
    )
    assert res.status_code == 200, res.text
    assert res.json()["order"]["status"] == "loading_completed"

    res = client.post(f"/api/orders/{order_id}/depart-station", headers=operator_headers)
    assert res.status_code == 200
    assert res.json()["order"]["status"] == "in_transit"

    res = client.post(
        f"/api/orders/{order_id}/complete-delivery",
        headers=operator_headers,
        json={"delivery_quantity_l": REQUESTED_QTY},
    )
    assert res.status_code == 200, res.text
    assert res.json()["order"]["status"] == "reconciliation_pending"

    res = client.post(f"/api/orders/{order_id}/reconcile", headers=operator_headers)
    assert res.status_code == 200
    assert res.json()["order"]["status"] == "reconciled"
    assert res.json()["order"]["available_actions"] == ["close"]

    res = client.post(f"/api/orders/{order_id}/close", headers=operator_headers)
    assert res.status_code == 200
    final = res.json()["order"]
    assert final["status"] == "closed"
    assert final["available_actions"] == []


def test_actor_attribution_records_the_real_logged_in_users(client, operator_headers, authorizer_headers):
    """
    Post-Phase-7 fix: AuditEntry.actor records the authenticated user's
    display_name, threaded from each router's current_user dependency —
    not the earlier generic "Operations Manager (demo role)" placeholder.
    """
    order, _station = _advance_to_loading(client, operator_headers, authorizer_headers)
    order_id = order["id"]

    res = client.get(f"/api/orders/{order_id}", headers=operator_headers)
    history = {h["action"]: h["actor"] for h in res.json()["audit_history"]}

    assert history["create_order"] == "Fahad Al-Harthy"  # operator1
    assert history["assign_tanker_driver"] == "Fahad Al-Harthy"
    assert history["authorize"] == "Hilal Al-Rawahi"  # authorizer1
    assert history["dispatch"] == "Fahad Al-Harthy"
    assert "Operations Manager (demo role)" not in history.values()


def test_meter_discrepancy_branch(client, operator_headers, authorizer_headers):
    order, _station = _advance_to_loading(client, operator_headers, authorizer_headers)
    order_id = order["id"]

    # Loaded well outside the +-2% tolerance band around the 10,000 L authorization.
    res = client.post(
        f"/api/orders/{order_id}/complete-loading",
        headers=operator_headers,
        json={"actual_loaded_quantity_l": 9_000},
    )
    assert res.status_code == 200, res.text
    order = res.json()["order"]
    assert order["status"] == "meter_discrepancy"
    assert order["exception_details"] is not None
    assert order["available_actions"] == []  # a dead-end exception state, not a further workflow step


def test_failed_reconciliation_branch(client, operator_headers, authorizer_headers):
    order, _station = _advance_to_loading(client, operator_headers, authorizer_headers)
    order_id = order["id"]

    res = client.post(
        f"/api/orders/{order_id}/complete-loading",
        headers=operator_headers,
        json={"actual_loaded_quantity_l": REQUESTED_QTY},
    )
    assert res.json()["order"]["status"] == "loading_completed"

    client.post(f"/api/orders/{order_id}/depart-station", headers=operator_headers)

    # Delivered well outside the +-2% tolerance band around the 10,000 L loaded.
    res = client.post(
        f"/api/orders/{order_id}/complete-delivery",
        headers=operator_headers,
        json={"delivery_quantity_l": 8_000},
    )
    assert res.json()["order"]["status"] == "reconciliation_pending"

    res = client.post(f"/api/orders/{order_id}/reconcile", headers=operator_headers)
    assert res.status_code == 200
    order = res.json()["order"]
    assert order["status"] == "failed_reconciliation"
    assert order["exception_details"] is not None


def test_invalid_transition_returns_409(client, operator_headers):
    order, _station = _create_order(client, operator_headers)
    # A freshly created order is "submitted" — cannot jump straight to loading.
    res = client.post(
        f"/api/orders/{order['id']}/complete-loading",
        headers=operator_headers,
        json={"actual_loaded_quantity_l": REQUESTED_QTY},
    )
    assert res.status_code == 409
    assert "submitted" in res.json()["detail"]


def test_authorize_before_assign_returns_409(client, operator_headers, authorizer_headers):
    order, _station = _create_order(client, operator_headers)
    res = client.post(f"/api/orders/{order['id']}/authorize", headers=authorizer_headers)
    assert res.status_code == 409


def test_cancel_from_submitted_records_reason_and_actor(client, operator_headers):
    order, _station = _create_order(client, operator_headers)
    res = client.post(
        f"/api/orders/{order['id']}/cancel",
        headers=operator_headers,
        json={"reason": "Customer called it off"},
    )
    assert res.status_code == 200, res.text
    cancelled = res.json()["order"]
    assert cancelled["status"] == "cancelled"
    assert cancelled["exception_details"] == "Customer called it off"
    assert cancelled["available_actions"] == []

    history = {h["action"]: h["actor"] for h in cancelled["audit_history"]}
    assert history["cancel"] == "Fahad Al-Harthy"
