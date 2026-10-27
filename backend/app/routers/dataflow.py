"""
Phase 4 — Interactive Data Flow architecture graph.

SIMULATION MODE: this graph describes the logical architecture of the
simulator itself (the services this demo app runs), not a real SCADA/PLC
network topology. The accompanying flow events (see /live/snapshot and
/stream/live) are derived from synthetic telemetry produced by
app.services.simulation.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import Station
from app.schemas.dataflow import DataFlowGraphOut

router = APIRouter(prefix="/dataflow", tags=["dataflow"])

CENTRAL_NODES = [
    {"id": "order_service", "label": "Order & Workflow Service", "kind": "central", "group": "core"},
    {"id": "auth_service", "label": "Authorization Service", "kind": "central", "group": "core"},
    {"id": "audit_service", "label": "Audit & Compliance Log", "kind": "central", "group": "core"},
    {"id": "dashboard_service", "label": "Analytics & Dashboard Service", "kind": "central", "group": "core"},
    {"id": "alert_engine", "label": "Alert Engine", "kind": "central", "group": "core"},
    {"id": "gps_service", "label": "GPS & Fleet Tracking Service", "kind": "central", "group": "core"},
]


@router.get("/graph", response_model=DataFlowGraphOut)
def get_graph(db: Session = Depends(get_db)):
    stations = db.query(Station).order_by(Station.name).all()
    nodes: list[dict] = list(CENTRAL_NODES)
    edges: list[dict] = []
    eid = 0

    def add_edge(source: str, target: str, kind: str) -> None:
        nonlocal eid
        eid += 1
        edges.append({"id": f"e{eid}", "from": source, "to": target, "type": kind})

    add_edge("gps_service", "order_service", "gps_ping")
    add_edge("order_service", "auth_service", "authorization_check")
    add_edge("order_service", "audit_service", "audit_write")
    add_edge("order_service", "dashboard_service", "kpi_update")
    add_edge("order_service", "alert_engine", "exception_check")
    add_edge("alert_engine", "dashboard_service", "alert_surface")

    for s in stations:
        gw = f"gateway:{s.id}"
        plc = f"plc:{s.id}"
        nodes.append({"id": gw, "label": f"Edge Gateway — {s.name}", "kind": "gateway", "station_id": s.id, "station_name": s.name})
        nodes.append({"id": plc, "label": f"PLC & Meter — {s.name}", "kind": "plc", "station_id": s.id, "station_name": s.name})
        add_edge(plc, gw, "meter_reading")
        add_edge(gw, "order_service", "telemetry_ingest")
        add_edge(gw, "dashboard_service", "telemetry_forward")
        add_edge("auth_service", gw, "authorization_token")

    return DataFlowGraphOut(nodes=nodes, edges=edges)
