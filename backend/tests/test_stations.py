"""
Station edge-gateway connectivity actions (Phase 5 behavior, Phase 7
RBAC + actor attribution): disconnect/reconnect, double-action 409s, and
that the AuditEntry written records the real fleet-manager/admin user.
"""


def _pick_station_by_connectivity(client, headers, status):
    stations = client.get("/api/stations", headers=headers).json()
    for s in stations:
        if s["connectivity_status"] == status:
            return s
    raise AssertionError(f"No seeded station has connectivity_status == '{status}'.")


def test_disconnect_then_reconnect_round_trip(client, fleet_manager_headers):
    station = _pick_station_by_connectivity(client, fleet_manager_headers, "online")

    res = client.post(f"/api/stations/{station['id']}/disconnect", headers=fleet_manager_headers)
    assert res.status_code == 200, res.text
    assert res.json()["connectivity_status"] == "offline"

    res = client.post(f"/api/stations/{station['id']}/reconnect", headers=fleet_manager_headers)
    assert res.status_code == 200, res.text
    assert res.json()["connectivity_status"] == "online"


def test_disconnecting_an_already_offline_station_is_409(client, fleet_manager_headers):
    station = _pick_station_by_connectivity(client, fleet_manager_headers, "offline")
    res = client.post(f"/api/stations/{station['id']}/disconnect", headers=fleet_manager_headers)
    assert res.status_code == 409


def test_reconnecting_a_station_that_is_not_offline_is_409(client, fleet_manager_headers):
    station = _pick_station_by_connectivity(client, fleet_manager_headers, "online")
    res = client.post(f"/api/stations/{station['id']}/reconnect", headers=fleet_manager_headers)
    assert res.status_code == 409


def test_disconnect_and_reconnect_record_the_real_actor(client, fleet_manager_headers, admin_headers):
    station = _pick_station_by_connectivity(client, fleet_manager_headers, "online")

    client.post(f"/api/stations/{station['id']}/disconnect", headers=fleet_manager_headers)
    client.post(f"/api/stations/{station['id']}/reconnect", headers=admin_headers)

    audit = client.get(
        "/api/audit",
        headers=admin_headers,
        params={"entity_type": "station", "entity_id": station["id"]},
    ).json()
    actors_by_action = {row["action"]: row["actor"] for row in audit["items"]}
    assert actors_by_action["edge_gateway_disconnect"] == "Noor Al-Balushi"  # fleetmgr1
    assert actors_by_action["edge_gateway_resync"] == "Talal Al-Farsi"  # admin1
