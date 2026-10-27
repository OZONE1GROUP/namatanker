"""
Phase 3 — live simulation snapshot, SSE stream, and simulation-clock
controls. SIMULATION MODE: the stream carries only synthetic telemetry
produced by app.services.simulation; no real equipment is involved.
"""
import asyncio
import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.auth_deps import require_role
from app.database import get_db
from app.models.core import SimulationSettings
from app.models.enums import UserRole
from app.schemas.live import LiveSnapshotOut, SpeedRequest
from app.services.simulation import engine

router = APIRouter(tags=["live"])


def _get_or_create_sim_settings(db: Session) -> SimulationSettings:
    settings = db.get(SimulationSettings, 1)
    if settings is None:
        settings = SimulationSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/live/snapshot", response_model=LiveSnapshotOut)
def live_snapshot():
    snap = engine.get_snapshot()
    return LiveSnapshotOut(
        simulation_time=snap.get("simulation_time"),
        is_paused=snap.get("is_paused", False),
        speed_multiplier=snap.get("speed_multiplier", 1),
        loading=snap.get("loading", []),
        transit=snap.get("transit", []),
        geofence_events=snap.get("geofence_events", []),
        flow_events=snap.get("flow_events", []),
        stations=snap.get("stations", []),
        generated_at=snap.get("generated_at"),
    )


@router.get("/stream/live")
async def stream_live():
    queue = engine.subscribe()

    async def event_generator():
        try:
            while True:
                snapshot = await queue.get()
                yield f"data: {json.dumps(snapshot)}\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            engine.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/simulation/pause", dependencies=[Depends(require_role(UserRole.admin))])
def pause_simulation(db: Session = Depends(get_db)):
    settings = _get_or_create_sim_settings(db)
    settings.is_paused = True
    db.commit()
    return {"is_paused": True}


@router.post("/simulation/resume", dependencies=[Depends(require_role(UserRole.admin))])
def resume_simulation(db: Session = Depends(get_db)):
    settings = _get_or_create_sim_settings(db)
    settings.is_paused = False
    db.commit()
    return {"is_paused": False}


@router.post("/simulation/speed", dependencies=[Depends(require_role(UserRole.admin))])
def set_speed(payload: SpeedRequest, db: Session = Depends(get_db)):
    if payload.speed_multiplier < 1 or payload.speed_multiplier > 60:
        raise HTTPException(400, "speed_multiplier must be between 1 and 60")
    settings = _get_or_create_sim_settings(db)
    settings.speed_multiplier = payload.speed_multiplier
    db.commit()
    return {"speed_multiplier": settings.speed_multiplier}
