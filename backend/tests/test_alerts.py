"""
Alerts & Exceptions console actions: acknowledge/resolve/escalate, their
status-machine guards, and that the audit entry they write carries the
real logged-in user as actor (threaded via app/routers/alerts.py's
_record_audit helper, same pattern as orders/stations).
"""


def _pick_alert(client, headers, status):
    alerts = client.get("/api/alerts", headers=headers, params={"status": status, "page_size": 200}).json()
    items = alerts["items"]
    assert items, f"No seeded alert has status == '{status}'."
    return items[0]


def test_acknowledge_then_resolve(client, operator_headers):
    alert = _pick_alert(client, operator_headers, "open")

    res = client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)
    assert res.status_code == 200, res.text
    assert res.json()["alert"]["status"] == "acknowledged"

    res = client.post(f"/api/alerts/{alert['id']}/resolve", headers=operator_headers)
    assert res.status_code == 200, res.text
    assert res.json()["alert"]["status"] == "resolved"


def test_acknowledging_a_non_open_alert_is_409(client, operator_headers):
    alert = _pick_alert(client, operator_headers, "open")
    client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)

    res = client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)
    assert res.status_code == 409


def test_resolving_an_already_resolved_alert_is_409(client, operator_headers):
    alert = _pick_alert(client, operator_headers, "open")
    client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)
    client.post(f"/api/alerts/{alert['id']}/resolve", headers=operator_headers)

    res = client.post(f"/api/alerts/{alert['id']}/resolve", headers=operator_headers)
    assert res.status_code == 409


def test_escalating_a_resolved_alert_is_409(client, operator_headers):
    alert = _pick_alert(client, operator_headers, "open")
    client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)
    client.post(f"/api/alerts/{alert['id']}/resolve", headers=operator_headers)

    res = client.post(f"/api/alerts/{alert['id']}/escalate", headers=operator_headers)
    assert res.status_code == 409


def test_escalate_from_open_succeeds(client, auditor_headers):
    # auditor is read-only on the orders/stations screens but alert actions
    # carry no per-route role restriction today (router-level login only),
    # so this also documents that current, intentionally-scoped behavior.
    alert = _pick_alert(client, auditor_headers, "open")
    res = client.post(f"/api/alerts/{alert['id']}/escalate", headers=auditor_headers)
    assert res.status_code == 200
    assert res.json()["alert"]["status"] == "escalated"


def test_alert_actions_record_the_real_actor(client, operator_headers, admin_headers):
    alert = _pick_alert(client, operator_headers, "open")
    client.post(f"/api/alerts/{alert['id']}/acknowledge", headers=operator_headers)
    client.post(f"/api/alerts/{alert['id']}/resolve", headers=admin_headers)

    audit = client.get(
        "/api/audit",
        headers=admin_headers,
        params={"entity_type": "alert", "entity_id": alert["id"]},
    ).json()
    actors_by_action = {row["action"]: row["actor"] for row in audit["items"]}
    assert actors_by_action["acknowledge_alert"] == "Fahad Al-Harthy"  # operator1
    assert actors_by_action["resolve_alert"] == "Talal Al-Farsi"  # admin1
