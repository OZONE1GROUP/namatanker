from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth_deps import get_current_user
from app.config import get_settings
from app.routers import alerts, audit, auth, customers, dashboard, dataflow, fleet, live, orders, stations
from app.services.simulation import engine

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine.start()
    yield
    engine.stop()


app = FastAPI(
    title="OmanOne.tech Tanker Operations Simulator API",
    description=(
        "SIMULATION MODE — all data is synthetic. This API serves a simulated "
        "digital twin of a tanker loading and delivery operation and is never "
        "connected to real PLCs, meters, GPS devices or industrial equipment."
    ),
    version="0.7.0-phase7",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Phase 7 — login is public; every other router below requires a valid demo
# bearer token (see app/auth_deps.py). live.router is the one exception to
# "whole router" gating: its GET endpoints (snapshot/SSE stream) stay public
# because the browser's native EventSource can't attach an Authorization
# header, and simulated telemetry isn't sensitive — but its mutating
# simulation-clock routes carry their own per-route admin-role dependency
# (see app/routers/live.py), so controlling the clock still requires login.
app.include_router(auth.router, prefix="/api")
app.include_router(dashboard.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(orders.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(stations.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(fleet.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(audit.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(customers.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(live.router, prefix="/api")
app.include_router(alerts.router, prefix="/api", dependencies=[Depends(get_current_user)])
app.include_router(dataflow.router, prefix="/api", dependencies=[Depends(get_current_user)])


@app.get("/api/health", tags=["health"])
def health():
    return {"status": "ok", "mode": "SIMULATION"}
