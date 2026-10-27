"""
Phase 7 demo authentication: login, /me, /demo-users, and the two
deliberately-public /live endpoints.
"""
from tests.conftest import DEMO_USERNAMES, login


def test_demo_users_is_public_and_lists_all_five_roles(client):
    res = client.get("/api/auth/demo-users")
    assert res.status_code == 200
    roles = {u["role"] for u in res.json()}
    assert roles == set(DEMO_USERNAMES.keys())
    # Passwords are intentionally published for the one-click demo buttons.
    assert all(u["password"] == "demo123" for u in res.json())


def test_login_with_correct_password_succeeds(client):
    body = login(client, "operator1")
    assert body["user"]["username"] == "operator1"
    assert body["user"]["role"] == "operator"
    assert body["user"]["display_name"] == "Fahad Al-Harthy"
    assert body["token_type"] == "bearer"
    assert body["access_token"]


def test_login_with_wrong_password_is_rejected(client):
    res = client.post("/api/auth/login", json={"username": "operator1", "password": "wrong-password"})
    assert res.status_code == 401


def test_login_with_unknown_username_is_rejected(client):
    res = client.post("/api/auth/login", json={"username": "nobody", "password": "demo123"})
    assert res.status_code == 401


def test_me_returns_the_logged_in_user(client):
    token = login(client, "admin1")["access_token"]
    res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["username"] == "admin1"
    assert res.json()["role"] == "admin"


def test_me_without_a_token_is_unauthorized(client):
    res = client.get("/api/auth/me")
    assert res.status_code == 401


def test_me_with_a_garbage_token_is_unauthorized(client):
    res = client.get("/api/auth/me", headers={"Authorization": "Bearer not-a-real-jwt"})
    assert res.status_code == 401


def test_protected_router_rejects_unauthenticated_requests(client):
    # /orders is included with a router-level get_current_user dependency.
    res = client.get("/api/orders")
    assert res.status_code == 401


def test_protected_router_accepts_a_valid_token(client):
    headers = {"Authorization": f"Bearer {login(client, 'operator1')['access_token']}"}
    res = client.get("/api/orders", headers=headers)
    assert res.status_code == 200


def test_live_snapshot_is_public_by_design(client):
    """
    /live/snapshot deliberately stays unauthenticated (see app/routers/live.py)
    because the browser's native EventSource can't attach an Authorization
    header and the simulated telemetry it serves isn't sensitive.
    """
    res = client.get("/api/live/snapshot")
    assert res.status_code == 200
