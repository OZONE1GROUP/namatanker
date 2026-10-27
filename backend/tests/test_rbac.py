"""
Server-enforced role-based access control (Phase 7).

These checks use a random, nonexistent order/station id for the
role-gated order/station actions: ``require_role`` dependencies run before
the endpoint body, so a disallowed role always gets 403 regardless of
whether the target row exists, while an allowed role falls through to the
endpoint body and hits a plain 404 instead (never a 403) — that contrast
is what actually proves the gate is on the role, not on anything else.
"""
import uuid

import pytest

from tests.conftest import auth_headers

FAKE_ID = str(uuid.uuid4())

ALL_ROLES = ["operator", "authorization_officer", "fleet_manager", "auditor", "admin"]


@pytest.mark.parametrize("role", ALL_ROLES)
def test_every_logged_in_role_can_read_orders(client, role):
    res = client.get("/api/orders", headers=auth_headers(client, role))
    assert res.status_code == 200


@pytest.mark.parametrize(
    "role,expect_403",
    [
        ("operator", True),
        ("fleet_manager", True),
        ("auditor", True),
        ("authorization_officer", False),
        ("admin", False),
    ],
)
def test_authorize_order_requires_authorizer_or_admin(client, role, expect_403):
    res = client.post(f"/api/orders/{FAKE_ID}/authorize", headers=auth_headers(client, role))
    if expect_403:
        assert res.status_code == 403
        assert "authorization_officer" in res.json()["detail"] or "admin" in res.json()["detail"]
    else:
        assert res.status_code == 404  # role allowed; fell through to "order not found"


@pytest.mark.parametrize(
    "role,expect_403",
    [
        ("operator", True),
        ("fleet_manager", True),
        ("auditor", True),
        ("authorization_officer", False),
        ("admin", False),
    ],
)
def test_reject_order_requires_authorizer_or_admin(client, role, expect_403):
    res = client.post(
        f"/api/orders/{FAKE_ID}/reject",
        headers=auth_headers(client, role),
        json={"reason": "test"},
    )
    assert res.status_code == (403 if expect_403 else 404)


@pytest.mark.parametrize(
    "role,expect_403",
    [
        ("operator", True),
        ("authorization_officer", True),
        ("auditor", True),
        ("fleet_manager", False),
        ("admin", False),
    ],
)
def test_station_disconnect_requires_fleet_manager_or_admin(client, role, expect_403):
    res = client.post(f"/api/stations/{FAKE_ID}/disconnect", headers=auth_headers(client, role))
    assert res.status_code == (403 if expect_403 else 404)


@pytest.mark.parametrize(
    "role,expect_403",
    [
        ("operator", True),
        ("authorization_officer", True),
        ("auditor", True),
        ("fleet_manager", False),
        ("admin", False),
    ],
)
def test_station_reconnect_requires_fleet_manager_or_admin(client, role, expect_403):
    res = client.post(f"/api/stations/{FAKE_ID}/reconnect", headers=auth_headers(client, role))
    assert res.status_code == (403 if expect_403 else 404)


@pytest.mark.parametrize("role", ["operator", "authorization_officer", "fleet_manager", "auditor"])
def test_simulation_clock_rejects_every_non_admin_role(client, role):
    headers = auth_headers(client, role)
    assert client.post("/api/simulation/pause", headers=headers).status_code == 403
    assert client.post("/api/simulation/resume", headers=headers).status_code == 403
    assert client.post("/api/simulation/speed", headers=headers, json={"speed_multiplier": 5}).status_code == 403


def test_simulation_clock_accepts_admin(client):
    headers = auth_headers(client, "admin")
    assert client.post("/api/simulation/pause", headers=headers).status_code == 200
    assert client.post("/api/simulation/resume", headers=headers).status_code == 200
    res = client.post("/api/simulation/speed", headers=headers, json={"speed_multiplier": 5})
    assert res.status_code == 200
    assert res.json()["speed_multiplier"] == 5


def test_simulation_speed_out_of_range_is_rejected_even_for_admin(client):
    headers = auth_headers(client, "admin")
    res = client.post("/api/simulation/speed", headers=headers, json={"speed_multiplier": 999})
    assert res.status_code == 400
