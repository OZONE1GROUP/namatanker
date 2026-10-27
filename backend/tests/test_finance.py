"""
Phase 8 — finance & revenue-share module: price-per-liter configuration,
payment-gateway/commission settings (admin-only writes), and the
inbound/outbound transaction pair auto-posted when an order is closed.
"""
from decimal import Decimal

from tests.conftest import pick_customer, pick_idle_tanker_for_product, pick_station_with_bay

PRODUCT = "diesel"
REQUESTED_QTY = 10_000


def _create_and_close_order(client, operator_headers, authorizer_headers, product=PRODUCT, quantity=REQUESTED_QTY):
    """Drive a fresh order all the way to Closed, the revenue-share trigger."""
    customer = pick_customer(client, operator_headers)
    station = pick_station_with_bay(client, operator_headers)
    res = client.post(
        "/api/orders",
        headers=operator_headers,
        json={"customer_id": customer["id"], "station_id": station["id"], "product": product, "requested_quantity_l": quantity},
    )
    assert res.status_code == 201, res.text
    order_id = res.json()["id"]

    tanker = pick_idle_tanker_for_product(client, operator_headers, product)
    res = client.post(f"/api/orders/{order_id}/assign", headers=operator_headers, json={"tanker_id": tanker["id"]})
    assert res.status_code == 200, res.text

    res = client.post(f"/api/orders/{order_id}/authorize", headers=authorizer_headers)
    assert res.status_code == 200, res.text

    client.post(f"/api/orders/{order_id}/dispatch", headers=operator_headers)
    client.post(f"/api/orders/{order_id}/arrive-at-station", headers=operator_headers)

    idle_bay = next(b for b in station["loading_bays"] if b["status"] == "idle")
    res = client.post(f"/api/orders/{order_id}/start-loading", headers=operator_headers, json={"loading_bay_id": idle_bay["id"]})
    assert res.status_code == 200, res.text

    res = client.post(f"/api/orders/{order_id}/complete-loading", headers=operator_headers, json={"actual_loaded_quantity_l": quantity})
    assert res.json()["order"]["status"] == "loading_completed", res.text

    client.post(f"/api/orders/{order_id}/depart-station", headers=operator_headers)

    res = client.post(f"/api/orders/{order_id}/complete-delivery", headers=operator_headers, json={"delivery_quantity_l": quantity})
    assert res.json()["order"]["status"] == "reconciliation_pending", res.text

    res = client.post(f"/api/orders/{order_id}/reconcile", headers=operator_headers)
    assert res.json()["order"]["status"] == "reconciled", res.text

    res = client.post(f"/api/orders/{order_id}/close", headers=operator_headers)
    assert res.status_code == 200, res.text
    return res.json()["order"]


def test_pricing_is_seeded_for_every_product(client, operator_headers):
    res = client.get("/api/finance/pricing", headers=operator_headers)
    assert res.status_code == 200, res.text
    rows = res.json()
    products = {r["product"] for r in rows}
    assert products == {"diesel", "petrol_91", "petrol_95", "jet_fuel", "lpg"}
    for row in rows:
        assert Decimal(row["price_per_liter"]) > 0


def test_non_admin_cannot_update_pricing(client, operator_headers, fleet_manager_headers, auditor_headers):
    for headers in (operator_headers, fleet_manager_headers, auditor_headers):
        res = client.put("/api/finance/pricing/diesel", headers=headers, json={"price_per_liter": 0.5})
        assert res.status_code == 403, res.text


def test_admin_can_update_pricing(client, admin_headers):
    res = client.put("/api/finance/pricing/diesel", headers=admin_headers, json={"price_per_liter": "0.2200"})
    assert res.status_code == 200, res.text
    assert Decimal(res.json()["price_per_liter"]) == Decimal("0.2200")

    # Persisted — a fresh GET reflects it.
    res = client.get("/api/finance/pricing", headers=admin_headers)
    diesel = next(r for r in res.json() if r["product"] == "diesel")
    assert Decimal(diesel["price_per_liter"]) == Decimal("0.2200")


def test_unknown_product_rejected(client, admin_headers):
    res = client.put("/api/finance/pricing/unobtainium", headers=admin_headers, json={"price_per_liter": 1})
    assert res.status_code == 400


def test_settings_defaults_and_rbac(client, operator_headers, admin_headers):
    res = client.get("/api/finance/settings", headers=operator_headers)
    assert res.status_code == 200, res.text
    settings = res.json()
    assert settings["commission_model"] == "revenue_share"
    assert Decimal(settings["platform_commission_pct"]) > 0
    assert settings["payment_gateway_enabled"] is False

    res = client.put("/api/finance/settings", headers=operator_headers, json={"platform_commission_pct": 20})
    assert res.status_code == 403

    res = client.put(
        "/api/finance/settings",
        headers=admin_headers,
        json={"platform_commission_pct": 20, "payment_gateway_enabled": True, "payment_gateway_provider": "thawani", "payment_gateway_mode": "test"},
    )
    assert res.status_code == 200, res.text
    updated = res.json()
    assert Decimal(updated["platform_commission_pct"]) == Decimal("20")
    assert updated["payment_gateway_enabled"] is True
    assert updated["payment_gateway_provider"] == "thawani"


def test_closing_order_posts_inbound_and_outbound_transactions(client, operator_headers, authorizer_headers, admin_headers):
    # Pin a known price and commission so the expected split is exact.
    client.put("/api/finance/pricing/diesel", headers=admin_headers, json={"price_per_liter": "0.2000"})
    client.put("/api/finance/settings", headers=admin_headers, json={"platform_commission_pct": 10})

    order = _create_and_close_order(client, operator_headers, authorizer_headers, quantity=REQUESTED_QTY)
    assert order["status"] == "closed"
    assert order["price_per_liter"] == 0.2
    assert order["order_value"] == REQUESTED_QTY * 0.2  # 2000.0

    res = client.get(f"/api/finance/transactions?order_id={order['id']}", headers=operator_headers)
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert len(items) == 2

    inbound = next(t for t in items if t["type"] == "inbound")
    outbound = next(t for t in items if t["type"] == "outbound")

    assert inbound["category"] == "customer_payment"
    assert Decimal(inbound["amount"]) == Decimal("2000.000")
    assert Decimal(inbound["commission_amount"]) == Decimal("200.000")
    assert Decimal(inbound["net_amount"]) == Decimal("1800.000")

    assert outbound["category"] == "station_payout"
    assert Decimal(outbound["amount"]) == Decimal("1800.000")
    assert outbound["counterparty_type"] == "station"

    # Idempotency: re-closing isn't possible (409, already closed) and the
    # order's own transactions aren't duplicated by a second lookup either.
    res = client.post(f"/api/orders/{order['id']}/close", headers=operator_headers)
    assert res.status_code == 409
    res = client.get(f"/api/finance/transactions?order_id={order['id']}", headers=operator_headers)
    assert len(res.json()["items"]) == 2


def test_finance_summary_and_commission_report_reflect_posted_transactions(client, operator_headers, authorizer_headers, admin_headers):
    client.put("/api/finance/pricing/diesel", headers=admin_headers, json={"price_per_liter": "0.2000"})
    client.put("/api/finance/settings", headers=admin_headers, json={"platform_commission_pct": 10})
    _create_and_close_order(client, operator_headers, authorizer_headers, quantity=REQUESTED_QTY)

    res = client.get("/api/finance/summary?days=365", headers=operator_headers)
    assert res.status_code == 200, res.text
    summary = res.json()
    assert summary["transaction_count"] >= 2
    assert Decimal(summary["total_inbound"]) >= Decimal("2000.000")
    assert Decimal(summary["platform_net_revenue"]) >= Decimal("200.000")

    res = client.get("/api/finance/commission-report?days=365", headers=operator_headers)
    assert res.status_code == 200, res.text
    rows = res.json()["rows"]
    assert len(rows) > 0
    for row in rows:
        assert Decimal(row["gross_revenue"]) == Decimal(row["commission_amount"]) + Decimal(row["net_payout"])
