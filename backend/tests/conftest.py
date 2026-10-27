"""
Pytest fixtures for the OmanOne.tech backend test suite.

SIMULATION MODE / test isolation: these tests run against a dedicated
Postgres database (``omanone_sim_test``), never the demo database a person
might have open in the running app. The test database name is hard-coded
below and is NOT configurable via the ordinary .env, specifically so a
misconfigured environment can never cause a test run to wipe real demo
data — ``app/seed.py``'s ``seed()`` function drops and recreates every
table, which would be destructive against the dev database.

The DATABASE_URL (and a few other) environment variables are overridden
at import time, *before* any ``app.*`` module is imported anywhere in the
test session — ``app.config.get_settings()`` is ``@lru_cache``d and
``app.database`` builds its engine at module-import time, so this ordering
is what makes the whole app transparently point at the test database with
no FastAPI dependency-override plumbing required. pytest always loads a
directory's ``conftest.py`` before collecting its test modules, so this
file is guaranteed to run first.
"""
import os

TEST_DB_NAME = "omanone_sim_test"
TEST_DATABASE_URL = f"postgresql+psycopg://postgres:postgres@localhost:5432/{TEST_DB_NAME}"
ADMIN_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/postgres"

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["CORS_ORIGINS"] = "http://localhost:5173"
os.environ["JWT_SECRET"] = "test-only-secret-never-used-outside-pytest"


def _ensure_test_database_exists() -> None:
    import psycopg

    conn = psycopg.connect(ADMIN_DATABASE_URL, autocommit=True)
    try:
        conn.execute(f"CREATE DATABASE {TEST_DB_NAME}")
    except psycopg.errors.DuplicateDatabase:
        pass
    finally:
        conn.close()


_ensure_test_database_exists()

# Only safe to import app modules after the environment above is set and
# the test database is guaranteed to exist.
import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import DEMO_PASSWORD, DEMO_USERS, seed  # noqa: E402

DEMO_USERNAMES = {role.value: username for username, _display_name, role in DEMO_USERS}


@pytest.fixture(autouse=True)
def _reseed():
    """
    Full wipe + deterministic reseed before every test function.

    ``seed()`` drops and recreates every table and repopulates it from a
    fixed random seed, so each test starts from the exact same dataset —
    the simplest way to guarantee isolation given this schema's
    Postgres-specific UUID columns rule out a quick in-memory SQLite swap.
    The dataset is tiny (a handful of stations/tankers/orders), so a full
    reseed per test is milliseconds, not a real cost.
    """
    seed()
    yield


@pytest.fixture
def client():
    """
    A plain (non-context-manager) TestClient deliberately does NOT run the
    app's lifespan handler, so ``app.services.simulation.engine.start()``
    never spins up its background tick loop during tests. That keeps order
    statuses, station connectivity, etc. from mutating out from under an
    assertion — the handful of simulation-engine methods the API calls
    directly (e.g. ``set_station_offline``) only touch in-memory dict state
    and work fine with the loop never started.
    """
    return TestClient(app)


def login(client: TestClient, username: str, password: str = DEMO_PASSWORD) -> dict:
    """Log in and return the JSON body (access_token, user, ...)."""
    res = client.post("/api/auth/login", json={"username": username, "password": password})
    assert res.status_code == 200, res.text
    return res.json()


def auth_headers(client: TestClient, role: str) -> dict:
    """Bearer-auth header for one of the 5 seeded demo roles, by role name."""
    username = DEMO_USERNAMES[role]
    token = login(client, username)["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def operator_headers(client):
    return auth_headers(client, "operator")


@pytest.fixture
def authorizer_headers(client):
    return auth_headers(client, "authorization_officer")


@pytest.fixture
def fleet_manager_headers(client):
    return auth_headers(client, "fleet_manager")


@pytest.fixture
def auditor_headers(client):
    return auth_headers(client, "auditor")


@pytest.fixture
def admin_headers(client):
    return auth_headers(client, "admin")


def pick_station_with_bay(client: TestClient, headers: dict) -> dict:
    """Return a station detail payload (dict) that has at least one idle loading bay."""
    stations = client.get("/api/stations", headers=headers).json()
    for s in stations:
        detail = client.get(f"/api/stations/{s['id']}", headers=headers).json()
        if any(b["status"] == "idle" for b in detail["loading_bays"]):
            return detail
    raise AssertionError("No seeded station has an idle loading bay — seed data may have changed shape.")


def pick_idle_tanker_for_product(client: TestClient, headers: dict, product: str) -> dict:
    tankers = client.get("/api/tankers", headers=headers).json()
    for t in tankers:
        if t["assigned_product"] == product and t["status"] == "idle":
            return t
    raise AssertionError(f"No idle seeded tanker provisioned for product '{product}'.")


def pick_customer(client: TestClient, headers: dict) -> dict:
    customers = client.get("/api/customers", headers=headers).json()
    assert customers, "Seed data produced no customers."
    return customers[0]
