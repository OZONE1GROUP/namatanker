# Project Status

**Last updated:** Phase 7 completion (final phase), 2026-10-27.

## Current architecture

See `docs/ARCHITECTURE.md`. Summary: React + TypeScript + Vite frontend,
Python + FastAPI backend, PostgreSQL 16, JWT demo auth, Docker packaging.
Two documented stack deviations (FastAPI instead of Spring Boot; Docker
images written but not pull-tested in this build sandbox — both are the
same class of sandbox network restriction, see ARCHITECTURE.md §1).

## All 7 phases — working features (verified, not just written)

**Phase 1 — Foundation:** design system (light/dark), full 17-item nav,
Executive Overview (12 KPIs, 4 charts, insights) against seeded Postgres.

**Phase 2 — Core workflows:** Orders list/detail with the full 19-state
lifecycle and server-validated transitions (`available_actions` computed
per order, never guessed by the frontend); Tanker Fleet, Drivers, Stations
& Terminals directories + detail pages; `Authorization` records; Audit
Trail screen.

**Phase 3 — Simulation engine:** an async tick loop (`app/services/
simulation.py`) advancing a pausable/speed-adjustable simulation clock,
driving simulated PLC/meter telemetry and GPS/geofence events; SSE stream
(`/api/stream/live`) + REST snapshot fallback; Alerts & Exceptions console
with acknowledge/resolve/escalate actions, each audited.

**Phase 4 — Interactive data flow:** a clickable, animated architecture
diagram (`/data-flow`) built from the same tick data — no separate event
log table, derived purely from already-computed telemetry.

**Phase 5 — Offline recovery:** `/edge-gateway` lets you disconnect a
station's simulated edge gateway; its meter keeps metering locally and
queues readings (store-and-forward) instead of forwarding them; reconnect
flushes the queue and resyncs — verified via `curl` watching the meter
climb while the queue count incremented, then reset to 0 on reconnect.

**Phase 6 — Executive reporting:** `/reports` — threshold-driven
color-coded KPI tiles (not the static per-metric tones from Phase 1's
dashboard), orders-by-status breakdown, station performance table,
exception report (meter discrepancies + failed reconciliations), alert
severity summary, print-friendly layout. Every tile/row drills down to the
underlying filtered Orders/Fleet/Stations/Alerts/Events view.

**Phase 7 — Security, polish & packaging:**
- Real demo authentication: 5 seeded accounts (one per role), bcrypt
  password hashing, HS256 JWTs, 8-hour expiry.
- Server-enforced RBAC: `get_current_user` gates every router except
  `auth` and the two read-only `live` endpoints; `require_role(*roles)`
  additionally gates order authorize/reject, station connectivity
  controls, and the simulation clock.
- `/login` screen (one-click demo-role buttons + manual form), route guard
  (`RequireAuth`) redirecting unauthenticated visits, real user badge +
  logout in the header (replacing the old cosmetic "demo role" picker).
- `/admin` — Administration & Settings: account info, a live permission
  matrix, system status (API health, simulation clock), the demo-account
  table, and the theme toggle.
- Dark-mode toggle now persists across reloads via `localStorage` (the
  toggle mechanism itself existed since Phase 1; Phase 7 added
  persistence).
- A React error boundary around every routed page (keyed by path, so
  navigating away from a crash remounts cleanly) and a proper 404 page
  for unmatched routes.
- Docker packaging: per-service Dockerfiles, an nginx reverse-proxy config
  (including a dedicated unbuffered route for the SSE stream), and a root
  `docker-compose.yml` with a healthcheck-gated Postgres→backend→frontend
  startup order.
- **Follow-up (post-Phase-7, #1):** audit-trail entries now record the
  real logged-in user's `display_name` as `actor`, not the earlier
  generic placeholder string. `app/services/orders.py`'s `_audit()` and
  all 13 order-lifecycle functions, plus `create_order`, the two station
  connectivity endpoints, and the three alert actions, all accept an
  `actor` parameter threaded from each router's `current_user` dependency
  (`get_current_user`, the same one the RBAC gating already uses — no new
  DB query, since FastAPI caches it per request). Verified via `curl`: a
  disconnect/reconnect as `fleetmgr1` writes `actor: "Noor Al-Balushi"`;
  authorizing an order as `authorizer1` writes `"Hilal Al-Rawahi"`;
  acknowledging an alert as `operator1` writes `"Fahad Al-Harthy"`.
- **Follow-up (post-Phase-7, #2):** a backend automated test suite —
  `backend/tests/`, 58 `pytest` tests against the real FastAPI app via
  `TestClient`, covering auth, every RBAC gate (parametrized across all 5
  roles), the full order-lifecycle state machine including both exception
  branches, station connectivity, and alert actions — including a direct
  re-check, via the audit trail, of follow-up #1's actor attribution. Runs
  against a dedicated `omanone_sim_test` database the suite creates
  itself, so it never touches demo data in the running app. See
  `docs/ARCHITECTURE.md` §9.
- **Follow-up (post-Phase-7, #3):** a frontend automated test suite —
  `frontend/src/**/*.test.{ts,tsx}`, 31 Vitest + React Testing Library
  tests (`npm test`), covering the auth store (login/logout/401-handling
  against a mocked backend), the `RequireAuth` route guard, the `/login`
  screen end to end, the `ErrorBoundary`, the 404 page, and the
  formatting/status-color helper modules. Configured via its own
  `vitest.config.ts` and excluded from `tsconfig.app.json` so it can never
  affect `npm run dev` or `npm run build`. See `docs/ARCHITECTURE.md` §10
  for exactly what's covered and what's intentionally left for a further
  increment (the routed data pages' own role-based UI hiding — already
  covered on the backend side by `test_rbac.py`).

## How Phase 7 specifically was verified

- **Backend, via `curl`:** `GET /auth/demo-users` (public), unauthenticated
  `GET /orders` → `401`, login → `200` with a token, `GET /auth/me` with
  that token → correct user, authenticated `GET /orders` → `200`, wrong
  password → `401`. Role gating: an `operator` token against `POST
  /simulation/pause` → `403` with the exact roles required; an `admin`
  token → `200`. Same pattern re-confirmed for `POST /stations/{id}/
  disconnect`. SSE/`live/snapshot` confirmed to stay reachable with **no**
  token at all (by design — see ARCHITECTURE.md §6).
- **Frontend build:** `tsc -b && vite build` clean (zero errors) after
  every batch of changes, including after the Reports page and the full
  auth/admin/polish pass.
- **Frontend, via a real headless-browser pass (Playwright, Chromium):**
  1. Visiting `/` unauthenticated redirects to `/login`.
  2. The 5 demo-role buttons render (from `GET /auth/demo-users`).
  3. Logging in as `operator1` lands on `/` and the header shows the real
     name/role.
  4. `/reports` renders.
  5. `/admin` renders (permission matrix visible) even to a non-admin role.
  6. `/edge-gateway` shows "requires the Fleet Manager or Admin role"
     instead of live connect/disconnect buttons for the operator role.
  7. Logout returns to `/login`.
  8. Logging in as `admin1` succeeds.
  9. The simulation-clock pause/resume controls appear in the header only
     for the admin session.
  10. (Separate pass) Dark-mode toggle sets `data-theme="dark"` on
      `<html>`, persists to `localStorage`, and survives a full page
      reload; an unknown route renders the dedicated 404 page.
  Zero console/page errors across both passes.
- **Backend automated test suite:** `cd backend && python -m pytest` → 58
  passed, 0 failed, run twice in a row with identical results (confirming
  the per-test reseed gives real isolation, not order-dependent passes).
- **Frontend automated test suite:** `cd frontend && npm test` → 31
  passed, 0 failed, run three times in a row with identical results;
  `npm run build` re-confirmed clean (zero TypeScript errors, zero
  warnings beyond the pre-existing bundle-size note) after adding it.
- **Docker:** `docker compose config` resolves the full service graph,
  env vars, healthchecks and volumes with no errors. `docker compose
  build` reaches the registry (DNS resolves through the sandbox's egress
  proxy) but the registry pull itself returns `403 Forbidden` — a sandbox
  network-policy restriction, not a config error (same class as the Maven
  Central block that originally justified the FastAPI decision). Not
  retried further per the proxy's own guidance not to retry policy
  denials; documented in README.md and ARCHITECTURE.md rather than left
  unexplained or silently assumed to work.

## Commands to start the application

### Natively

```bash
# Terminal 1 — backend
cd backend && source .venv/bin/activate
python -m app.seed     # first run / to reset demo data + demo accounts
uvicorn app.main:app --reload --port 8000

# Terminal 2 — frontend
cd frontend && npm run dev
```

Open `http://localhost:5173`, then log in with any account from the seed
script's printed table (all share password `demo123`).

### Docker

```bash
docker compose up -d --build
docker compose exec backend python -m app.seed   # first run only
```

Open `http://localhost:8080`.

## Known limitations (carried into this final status, see README for detail)

- Docker image pull untested end-to-end in this sandbox (compose config
  validated; Dockerfiles follow standard patterns).
- Demo-grade auth (5 seeded accounts, no SSO/MFA) — intentional, matches
  the simulator's purpose of demonstrating RBAC, not shipping an identity
  platform.
- Both backend (58 tests, Follow-up #2) and frontend (31 tests,
  Follow-up #3) now have automated test suites. What's NOT yet
  automated: the routed data pages themselves (Orders, Fleet, Stations,
  Reports, Admin, etc.) and the role-based UI hiding inside them — still
  verified by build-clean TypeScript checks and the scripted Playwright
  passes above, not a committed test. The backend side of that same RBAC
  behavior is already fully covered by `backend/tests/test_rbac.py`.
- ~880 KB production JS bundle (252 KB gzipped) — a route-level
  code-splitting candidate if the app grows further, not a current bug.

## This project is complete

All 7 phases of the master development brief are built, wired end-to-end,
and verified by the methods above. There is no "next phase" queued; the
items in "Known limitations" above are the honestly-scoped, intentionally
deferred edges — not missing phases.

## Resuming work on this project

1. Read this file and `docs/ARCHITECTURE.md` first.
2. Start both servers (commands above), log in, and confirm the dashboard
   loads with live data before writing new code.
3. If picking up one of the remaining "Known limitations" items: extending
   the frontend suite (`frontend/src/**/*.test.{ts,tsx}`, currently 31
   tests — see §10 of `docs/ARCHITECTURE.md`) to cover the routed data
   pages and their role-based UI hiding (e.g. a mocked-API test for
   `OrderDetail`'s authorizer-only actions or `EdgeGateway`'s
   fleet-manager-only connect button) is the most natural next piece of
   work — the backend side of that same behavior is already covered by
   `backend/tests/test_rbac.py`.
