# Architecture — OmanOne.tech Tanker Operations Simulator

**Status:** All 7 phases complete. SIMULATION MODE only — no real PLCs,
meters, GPS devices or industrial equipment are connected or controlled by
this application, at any phase.

## 1. Stack — and the two documented deviations from the original spec

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Tailwind CSS v4, shadcn-style primitives, Lucide icons, Recharts, React Router v7, Zustand |
| Backend | **Python 3.13 + FastAPI** (see deviation #1) |
| ORM / validation | SQLAlchemy 2.x + Pydantic v2 |
| Database | PostgreSQL 16 |
| Auth | PyJWT (HS256) + bcrypt, demo accounts seeded by `app/seed.py` (see deviation #2) |
| Dev/runtime | Uvicorn (ASGI), Vite dev server |
| Packaging | Docker (per-service Dockerfiles) + Docker Compose |

### Deviation #1: FastAPI instead of Spring Boot

The original spec called for Java 21 + Spring Boot. That stack could not be
built or tested in the development sandbox this was built in, because Maven
Central was not reachable from that environment — only npm and PyPI were.
Per the master prompt's own compatibility clause ("if a selected library or
framework causes a compatibility problem, use a stable alternative, document
the decision and continue with a working build"), the backend was built in
**FastAPI** instead. It preserves every architectural property the spec
asked for:

- REST APIs with Pydantic request/response schemas
- A modular monolith (routers/services/models packages, no microservices)
- An ORM with migrations-ready models (SQLAlchemy; Alembic is installed)
- Server-Sent Events for streaming simulation updates (`StreamingResponse`,
  no extra infrastructure)
- Role-based access control via dependency injection (FastAPI `Depends`),
  functionally equivalent to Spring Security method-level authorization
- No Kafka, Kubernetes, or multi-database complexity

### Deviation #2: Docker images written but not pulled/built in this sandbox

Phase 7 packages the full stack as Docker images + Compose (see §7). The
same sandbox network restriction that blocked Maven Central in deviation #1
also blocks Docker Hub (`registry-1.docker.io` → `403 Forbidden` through the
sandbox's egress proxy, confirmed via `docker compose build`). `docker
compose config` was used instead to validate the full compose file (service
graph, environment variables, healthchecks, volumes, port mappings) parses
and resolves correctly. The Dockerfiles themselves follow standard,
widely-used patterns (slim Python base + pip install; multi-stage Node
build → nginx static serve). This should build cleanly in any normal
network environment — flagging it here rather than silently claiming an
untested path works.

If you'd rather have the real Spring Boot backend, the REST contract below
is stable and reimplementing it in Spring Boot against the same PostgreSQL
schema is a contained, well-scoped piece of follow-up work.

## 2. Repository layout

```
omanone-tanker-sim/
├── docker-compose.yml         Postgres + backend + frontend/nginx (Phase 7)
│
├── frontend/                  React + TypeScript + Vite app
│   ├── Dockerfile             multi-stage: npm build → nginx serve
│   ├── nginx.conf             /api reverse proxy incl. the SSE stream
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/        AppShell, Sidebar, Header, SimulationClock,
│   │   │   │                  RequireAuth (route guard), ErrorBoundary
│   │   │   └── ui/            Card, KpiCard, Badge, Button, Modal
│   │   ├── config/
│   │   │   └── navigation.tsx    Single source of truth for the 17 nav modules
│   │   ├── lib/                api.ts (typed fetch client incl. auth header),
│   │   │                       auth.ts (Zustand session store), roles.ts,
│   │   │                       useLiveSnapshot.ts (SSE+polling), utils.ts
│   │   ├── pages/               One file per module — see §4 for the map
│   │   │                        to the phase that built it
│   │   └── store/               appStore.ts (Zustand — theme w/ localStorage,
│   │                            sidebar collapse)
│   └── vite.config.ts           proxies /api → http://localhost:8000 in dev
│
├── backend/                  FastAPI app
│   ├── Dockerfile
│   ├── app/
│   │   ├── main.py             FastAPI app, CORS, router registration +
│   │   │                       per-router auth dependency wiring
│   │   ├── config.py            Settings (env-driven, incl. JWT secret)
│   │   ├── database.py          SQLAlchemy engine/session
│   │   ├── security.py          password hashing + JWT encode/decode
│   │   ├── auth_deps.py         get_current_user / require_role(*roles)
│   │   ├── models/               enums.py, core.py (incl. User, UserRole)
│   │   ├── schemas/               one module per resource
│   │   ├── routers/               one module per resource, incl. auth.py
│   │   ├── services/              orders.py (state machine), simulation.py
│   │   │                          (tick engine), insights.py
│   │   └── seed.py               Deterministic demo-data + demo-user generator
│   └── requirements.txt
│
└── docs/
    ├── ARCHITECTURE.md        (this file)
    └── PROJECT_STATUS.md      What's built, how it was verified, how to resume
```

## 3. Data model

`Customer`, `Station`, `LoadingBay`, `Tanker`, `Driver`, `Order`,
`Authorization`, `Alert`, `AuditEntry`, `SimulationSettings`, `User`.

`Order` carries the full 19-state lifecycle from spec section 8 (including
all six exception states) behind a validated transition service
(`app/services/orders.py`) that computes each order's legal
`available_actions` server-side — the frontend never guesses what's legal.

`User` (Phase 7) is intentionally minimal — `username`, `display_name`,
`role` (a `UserRole` enum: `operator`, `authorization_officer`,
`fleet_manager`, `auditor`, `admin`), `password_hash` — by design, since
this is a demo identity store, not a production one.

Represented as derived/in-memory rather than persisted tables, by design:
simulated PLC/meter/GPS telemetry (`app/services/simulation.py`'s
`LoadingTelemetry`/`TransitTelemetry` dataclasses, regenerated from
wall-clock elapsed time) and the interactive data-flow event log (derived
from the same tick data, not separately written).

## 4. Page-to-phase map (frontend)

| Page | Route | Phase |
|---|---|---|
| Executive Overview | `/` | 1 |
| Orders & Authorizations, detail | `/orders`, `/orders/:id` | 2 |
| Tanker Fleet, detail | `/fleet`, `/fleet/:id` | 2 |
| Drivers | `/drivers` | 2 |
| Stations & Terminals, detail | `/stations`, `/stations/:id` | 2 |
| Audit Trail | `/audit` | 2 |
| Live Operations | `/live-operations` | 3 |
| TFS Simulator, PLC & Meter Simulator, GPS & Geofencing | `/tfs-simulator`, `/plc-meter`, `/gps` | 3 |
| Alerts & Exceptions | `/alerts` | 3 |
| Interactive Data Flow | `/data-flow` | 4 |
| Edge Gateway & Offline Mode | `/edge-gateway` | 5 |
| Events & Reconciliation | `/events` | 5 |
| Analytics & Reports | `/reports` | 6 |
| Login | `/login` | 7 |
| Administration & Settings | `/admin` | 7 |

`System Health` (`/system-health`) remains a labeled placeholder — it was
never scoped into any of the 7 phases' acceptance criteria and is called
out here rather than silently left unexplained.

## 5. API surface

All endpoints are under `/api`. Every router except `auth` and the two
read-only `live` endpoints requires a valid bearer token (see §6); specific
mutating endpoints additionally require a role.

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /health` | Liveness check | public |
| `POST /auth/login` | Exchange username/password for a JWT | public |
| `GET /auth/me` | Current user | any logged-in user |
| `GET /auth/demo-users` | Seeded demo accounts (for the login screen) | public |
| `GET /dashboard` | KPIs, chart series, insights | any logged-in user |
| `GET/POST /orders`, `/orders/{id}/*` | Order CRUD + lifecycle actions | any logged-in user, except `authorize`/`reject` → `authorization_officer`/`admin` |
| `GET /stations`, `/stations/{id}` | Station directory/detail | any logged-in user |
| `POST /stations/{id}/disconnect`, `/reconnect` | Simulated edge-gateway connectivity | `fleet_manager`/`admin` |
| `GET /tankers`, `/drivers` | Fleet directory | any logged-in user |
| `GET /audit` | Audit trail | any logged-in user |
| `GET /alerts`, `/alerts/{id}/*` | Alert list + acknowledge/resolve/escalate | any logged-in user |
| `GET /live/snapshot`, `GET /stream/live` (SSE) | Simulated telemetry, polled or streamed | **public** — see §6 for why |
| `POST /simulation/pause`, `/resume`, `/speed` | Simulation clock controls | `admin` |
| `GET /dataflow/graph` | Static architecture graph for the data-flow diagram | any logged-in user |

Every number on the Executive Overview and Analytics & Reports pages is a
real aggregate query against the seeded PostgreSQL data — there are no
hardcoded KPI values anywhere in the frontend.

## 6. Authentication & authorization (Phase 7)

**Model:** `POST /auth/login` checks a bcrypt hash and returns a short-lived
(8-hour) HS256 JWT carrying `sub` (user id), `username`, and `role`. The
frontend stores it in `localStorage` (via a small Zustand store,
`frontend/src/lib/auth.ts`) and attaches `Authorization: Bearer <token>` to
every API call; a 401 anywhere triggers an automatic logout back to
`/login`.

**Enforcement is server-side, not just UI.** `app/auth_deps.py` provides two
dependencies:

- `get_current_user` — decodes and validates the token, loads the `User`
  row; applied to whole routers at once in `main.py`
  (`app.include_router(x.router, dependencies=[Depends(get_current_user)])`)
  so every route in that router requires *some* valid logged-in user.
- `require_role(*roles)` — an additional per-route dependency for the
  handful of actions that need more than "logged in": order
  authorize/reject, station connectivity controls, and the simulation
  clock. A blocked call gets a real `403` with the roles it needed, not a
  silently-hidden button.

The frontend mirrors every one of these checks (hiding/disabling the
corresponding buttons, with a short explanation of which role is needed) as
a UX convenience — but the comments next to each check explicitly say the
backend is the actual guard, and a direct `curl` to a blocked endpoint with
the wrong role's token still gets a 403 regardless of what the UI shows.

**Why `/live/snapshot` and `/stream/live` stay public:** the browser's
native `EventSource` API (used for the live-telemetry SSE stream) cannot
attach a custom `Authorization` header, and the data on that stream is
simulated telemetry, not sensitive — so rather than build a token-in-URL
workaround for a demo-only data feed, this one pair of GET endpoints is
left open while every mutating simulation-clock route still requires
`admin`.

## 7. Packaging (Phase 7)

`backend/Dockerfile` (python:3.13-slim + pip install + uvicorn, no
`--reload` in the image), `frontend/Dockerfile` (multi-stage: `node:20-alpine`
build → `nginx:1.27-alpine` serve), `frontend/nginx.conf` (serves the SPA,
reverse-proxies `/api` including a dedicated unbuffered location for the SSE
stream), and a root `docker-compose.yml` wiring `postgres:16-alpine` +
`backend` + `frontend` with a healthcheck-gated startup order. See the
README's Docker quick-start, and its note on this repo's own build
environment not being able to pull Docker Hub base images.

## 8. Design system

Tokens live in `frontend/src/index.css` under `@theme`, matching the spec's
palette (navy `#10243A`, teal `#0F9D92`, blue `#3182CE`, plus six semantic
status colors with light/dark-aware `-bg` pairs). Tailwind v4 auto-generates
utility classes from those tokens, and a `data-theme="dark"` attribute swap
on `<html>` drives the dark control-room theme (toggle in the header or on
`/admin`; the choice persists in `localStorage` as of Phase 7). A `@media
print` block (also Phase 7) strips the nav/header for a clean print of the
Analytics & Reports page.

One recurring implementation note worth keeping in mind for future work:
Tailwind's build-time scanner can only see class names that appear literally
in source — a color built from a runtime variable (`` `bg-status-${tone}` ``)
gets silently purged from the production build. Every place in this codebase
that needs a color driven by a runtime value (variance bars, KPI tiers,
alert-severity tiles) goes through an inline `style` with the raw CSS
variable (`var(--color-status-green)`, etc.) instead, with a comment
pointing back to this note.

## 9. Automated test suite (backend)

`backend/tests/` is a `pytest` suite that drives the real FastAPI app
through `fastapi.testclient.TestClient` and real HTTP-shaped requests —
black-box, through the API, the same way the frontend calls it — rather
than calling service functions directly. 58 tests, all passing:

- **`test_auth.py`** — login success/failure, `/auth/me`, `/auth/demo-users`
  being public, a protected router rejecting an unauthenticated request,
  and confirming `/live/snapshot` stays public by design.
- **`test_rbac.py`** — every `require_role(...)` gate in the app
  (order authorize/reject, station disconnect/reconnect, the simulation
  clock), parametrized across all 5 roles, asserting **403** for a
  disallowed role and a role-agnostic status (404/200) for an allowed one
  — proving the gate is server-side on the role, not just a hidden button.
- **`test_orders_lifecycle.py`** — the full order state machine end to end:
  happy path through to `closed`; the `meter_discrepancy` and
  `failed_reconciliation` exception branches (outside the ±2% tolerance
  bands); an invalid transition returning 409; a cancellation; and that
  every `AuditEntry.actor` written along the way is the real logged-in
  user's `display_name` (the post-Phase-7 audit-actor-attribution fix),
  never the old placeholder string.
- **`test_stations.py`** / **`test_alerts.py`** — connectivity
  disconnect/reconnect and alert acknowledge/resolve/escalate, their
  status-machine 409 guards, and the same real-actor check on their audit
  entries.

**Test isolation.** The suite never touches the `omanone_sim` database a
person might have open in the running app. `tests/conftest.py` points
`DATABASE_URL` at a dedicated `omanone_sim_test` Postgres database
*before* importing anything from `app` (`app.config.get_settings()` is
`@lru_cache`d and `app.database` builds its engine at import time, so this
ordering is what makes the whole app transparently target the test
database with no FastAPI `dependency_overrides` needed) — pytest always
loads a directory's `conftest.py` before collecting its test modules, so
this is guaranteed to run first. `conftest.py` creates that database if it
doesn't exist yet, and an `autouse` fixture calls `app.seed.seed()` — a
full drop/recreate/repopulate from a fixed random seed — before every
single test function, so every test starts from the same deterministic
dataset with no cross-test leakage. Postgres-specific `UUID` columns in
the schema ruled out a quick swap to in-memory SQLite for speed; the
seeded dataset is small enough that a full reseed per test is still
milliseconds.

Deliberately not covered: the live SSE stream and the simulation tick loop
itself (inherently async/time-based — the test `TestClient` fixture is
used *without* its context-manager form specifically so the app's
`lifespan` handler, and therefore `engine.start()`'s background tick loop,
never runs during a test, which is what keeps order/station state from
mutating out from under an assertion) and the Docker build (already
covered, and already honestly scoped as untested end-to-end, in §7).

Run it:

```bash
cd backend && source .venv/bin/activate
pip install -r requirements-dev.txt   # pytest + httpx, once
python -m pytest
```

## 10. Automated test suite (frontend)

`frontend/src/**/*.test.{ts,tsx}` is a Vitest + React Testing Library suite
(31 tests, 8 files), run with `npm test`. It is configured by its own
`vitest.config.ts` rather than by adding a `test` block to the app's
`vite.config.ts` — Vitest does not auto-merge a sibling `vite.config.ts`'s
plugins when a dedicated `vitest.config.ts` exists, so the React plugin and
the `@` path alias are repeated there, and the two configs can never
interfere with `npm run dev` or `npm run build`. Test files are also
excluded from `tsconfig.app.json` (the project `tsc -b` type-checks before
`vite build`), so a test-only type issue can never block a production
build.

- **`lib/utils.test.ts`, `lib/orderStatus.test.ts`, `lib/roles.test.ts`** —
  pure-function unit tests: class-name merging, number/volume/currency/
  Asia-Muscat-timezone formatting, the status→badge-color map (including
  that an unrecognized status falls back to grey instead of throwing), and
  the initials/role-label helpers used in the header and login screen.
- **`lib/auth.test.ts`** — the Zustand auth store against a mocked
  `fetch`: a successful login persists token+user to both the store and
  `localStorage`; a 401 surfaces "Incorrect username or password." without
  persisting anything; a non-401 failure surfaces the "backend
  unreachable" message; `logout()` clears both; and `handleUnauthorized()`
  only logs out a session that actually thought it was logged in (a
  401 from the login screen's own wrong-password attempt must not loop).
- **`components/layout/RequireAuth.test.tsx`** — the route guard redirects
  to `/login` with no session and renders the guarded route with one,
  using a real `MemoryRouter` rather than mocking `react-router-dom`.
- **`pages/Login.test.tsx`** — against a mocked backend: the one-click
  demo-role buttons load from `/auth/demo-users` and log in on click;
  manual sign-in surfaces the real error message on a wrong password; and
  a session that already exists redirects straight past the login screen.
- **`components/layout/ErrorBoundary.test.tsx`** — renders children
  normally, and renders the fallback (not a blank screen) when a child
  throws during render.
- **`pages/NotFound.test.tsx`** — renders the 404 page's link back to the
  Executive Overview.

Run it:

```bash
cd frontend
npm test          # vitest run — one-shot, CI-style
npm run test:watch  # vitest — interactive watch mode
```

Deliberately not covered yet: the routed pages that call the live backend
(Orders, Fleet, Stations, Reports, Admin, etc.) and the role-based control
hiding inside them (e.g. `OrderDetail`'s authorizer-only actions,
`EdgeGateway`'s fleet-manager-only connect button) — those would need
either a mocked API client per page or a running backend, and are a
reasonable next increment on top of this suite rather than a gap in it:
the backend side of that same behavior is already fully covered by
`backend/tests/test_rbac.py` (§9).
