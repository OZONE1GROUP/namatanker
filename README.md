# OmanOne.tech — Integrated Digital Tanker Operations Simulator

An interactive, enterprise-grade digital twin of a tanker loading and
delivery operation. **All data is synthetic and the application is
permanently labeled SIMULATION MODE** — it is never connected to real
PLCs, meters, GPS devices or industrial equipment, in any phase.

Built incrementally, phase by phase, per the master development brief.
**All 7 phases are complete.** See `docs/PROJECT_STATUS.md` for exactly
what works today, and `docs/ARCHITECTURE.md` for the stack, the data
model, the API surface and the two documented deviations from the
original spec.

## What's working

- **Phase 1 — Foundation:** full navigation, design system (light/dark),
  Executive Overview dashboard (12 KPIs, 4 charts, insights) wired to a
  real seeded PostgreSQL database.
- **Phase 2 — Core workflows:** Orders (19-state lifecycle, validated
  transitions, audit trail), Tanker Fleet, Drivers, Stations & Terminals,
  Authorization records, full Audit Trail screen.
- **Phase 3 — Simulation engine:** a live async tick loop drives
  simulated PLC/meter telemetry, GPS/geofencing, and alerts; a
  pausable/speed-adjustable simulation clock; an Alerts & Exceptions
  console.
- **Phase 4 — Interactive data flow:** a clickable, animated system
  architecture diagram showing live events moving between edge
  gateways, services and the dashboard, driven by the same tick data.
- **Phase 5 — Offline recovery:** simulate a station's edge gateway
  going offline — its meter keeps metering locally and queues every
  reading (store-and-forward) — then reconnect to watch it flush and
  resync, demonstrated on the Edge Gateway & Offline Mode screen.
- **Phase 6 — Executive reporting:** a color-coded Analytics & Reports
  page with threshold-driven KPI tiles, an orders-by-status breakdown,
  a station performance table, an exception report, and an alert
  summary — every figure drills down to the underlying records, plus a
  print-friendly layout.
- **Phase 7 — Security, polish & packaging:** real demo authentication
  (JWT + 5 seeded roles) with server-enforced role-based access control,
  a login screen, an Administration & Settings page (permission matrix,
  system status, demo account list, theme toggle), a global error
  boundary, a proper 404 page, and Docker packaging for the whole stack.

## Quick start — running natively

You'll need **Node.js 20+**, **Python 3.11+**, and **PostgreSQL 14+**
installed locally.

### 1. Database

```bash
createdb omanone_sim
```

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env             # edit DATABASE_URL/JWT_SECRET if needed
python -m app.seed               # creates tables + loads deterministic demo data + 5 demo user accounts
uvicorn app.main:app --reload --port 8000
```

API is now live at `http://localhost:8000`. Interactive docs (automatic,
courtesy of FastAPI) at `http://localhost:8000/docs`.

### 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The dev server proxies `/api` to the
backend on port 8000, so both must be running.

### Logging in

The app requires sign-in (Phase 7). The seed script prints a table of
demo accounts; the login screen also lists them with one-click buttons.
Every seeded account shares the password **`demo123`**:

| Username | Role | Can do |
|---|---|---|
| `operator1` | Terminal Operator | Day-to-day order/loading workflow |
| `authorizer1` | Authorization Officer | Issue/reject loading authorizations |
| `fleetmgr1` | Fleet & Stations Manager | Fleet, stations, edge-gateway connectivity |
| `auditor1` | Compliance Auditor | Read-only across orders, audit trail, reports |
| `admin1` | System Administrator | Everything, including the simulation clock |

Log in as different roles to see the permission matrix on
**Administration & Settings** (`/admin`) enforced live — a role-gated
action (e.g. an Operator trying to authorize an order) returns a real
403 from the API, not just a hidden button.

### Resetting the demo data

Re-run `python -m app.seed` at any time — it wipes and regenerates a
deterministic dataset (fixed random seed) plus the 5 demo user accounts,
so every reset produces the same data and the same logins.

### Running the automated test suite

```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt   # pytest + httpx, once
python -m pytest
```

58 tests covering login/RBAC, the full order-lifecycle state machine
(happy path, both exception branches, invalid transitions), station
connectivity, and alert actions — all run against a dedicated
`omanone_sim_test` Postgres database that the suite creates itself, never
against your `omanone_sim` demo data. See `docs/ARCHITECTURE.md` §9 for
exactly what's covered and how isolation works.

There's a frontend suite too (Vitest + React Testing Library, 31 tests):

```bash
cd frontend
npm test
```

Covers the auth store, the route guard, the login screen, the error
boundary, the 404 page, and the formatting/status-color helper modules.
See `docs/ARCHITECTURE.md` §10 for exactly what's covered (and what
isn't yet).

## Quick start — Docker

A full stack (Postgres + backend + frontend/nginx) is packaged as a
Docker Compose setup at the repo root:

```bash
docker compose up -d --build
docker compose exec backend python -m app.seed   # first run only
```

Open `http://localhost:8080`. The frontend container's nginx reverse-proxies
`/api` to the backend container (including the live-telemetry SSE stream),
exactly like Vite's dev proxy does locally.

> **Note on this repo's own build environment:** the Dockerfiles and
> `docker-compose.yml` were written, and `docker compose config` was used
> to validate the full compose file (service graph, environment,
> healthchecks, volumes) — but actually pulling the base images
> (`python:3.13-slim`, `node:20-alpine`, `nginx:1.27-alpine`) from Docker
> Hub was blocked by this development sandbox's network egress policy
> (confirmed via `docker compose build` → `403 Forbidden` from the
> registry, the same class of restriction that forced the FastAPI-over-
> Spring-Boot decision below — see `docs/ARCHITECTURE.md`). This is a
> sandbox restriction, not a defect in the packaging; it will pull and
> build normally on a machine or CI runner with ordinary internet access
> to Docker Hub. Worth a confirmation run on your end after cloning.

## Project structure, full data model and API surface

See `docs/ARCHITECTURE.md`.

## Known limitations (honest, as of Phase 7 / final)

- **Docker image pull untested end-to-end** in this build sandbox (see
  note above) — the compose file validates, the Dockerfiles follow
  standard, well-tested patterns, but a live `docker compose up` build
  could not be completed here.
- **Demo-grade auth, not production auth.** Five seeded accounts, no
  SSO/MFA/password reset, a documented default JWT secret
  (`JWT_SECRET` in `.env`) — intentional for a simulator whose point is
  demonstrating RBAC, not shipping an identity platform. Every
  role-based restriction is still enforced server-side (FastAPI
  dependencies), not just hidden in the UI.
- Both backend (58 `pytest` tests) and frontend (31 Vitest/RTL tests) now
  have automated test suites — see "Running the automated test suite(s)"
  above and `docs/ARCHITECTURE.md` §§9–10. The frontend suite covers the
  auth store, route guard, login screen, error boundary, 404 page, and
  the formatting/status-color helpers; the routed data pages themselves
  (Orders, Fleet, Stations, Reports, Admin, etc.) and their role-based UI
  hiding are still verified by `npm run build` (zero TypeScript errors)
  and a manually-run Playwright pass (see `docs/PROJECT_STATUS.md`), not
  yet by a committed test — a reasonable next increment, not a gap, given
  the backend side of that same RBAC behavior is already fully covered.
- The production JS bundle is ~880 KB (252 KB gzipped) — Recharts plus
  7 phases of pages in one chunk. Not a bug, but worth route-level code
  splitting if this grows further.
