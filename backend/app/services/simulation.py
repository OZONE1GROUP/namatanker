"""
Phase 3 simulation engine (spec: Simulation Mode / Terminal Filling &
PLC/Meter/GPS simulators).

SIMULATION MODE — everything in this module invents plausible telemetry
(flow-meter totalizer readings, GPS transit progress, occasional equipment
alerts) purely for demonstration. It never reads from, writes to, or
connects to any real PLC, flow meter, GPS device, or other industrial
equipment.

Design note: live per-order telemetry (loaded_volume_l while a bay is
actively filling, transit progress/position while a tanker is en route,
and the geofence event log) is kept in this process's memory rather than
persisted to the database. It is regenerated every tick from wall-clock
elapsed time and is not a system-of-record fact — the system of record is
whatever the operator actually confirms through the order action endpoints
(e.g. complete-loading's actual_loaded_quantity_l). This avoids a schema
migration for data that is inherently transient, and mirrors how a real
SCADA/HMI layer shows live values that only become "facts" once an
operator commits them. Restarting the API process simply resets the
in-flight animation — it does not lose or corrupt any order.
"""
import asyncio
import logging
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from app.database import SessionLocal
from app.models.core import Alert, LoadingBay, Order, SimulationSettings, Station, Tanker
from app.models.enums import AlertSeverity, ConnectivityStatus, OrderStatus
from app.services import kyc as kyc_service
from app.services.geo import STATION_COORDS, land_jitter

# Phase 9 — how often (in ticks) the engine re-scans driver/tanker KYC
# validity and syncs Alerts & Exceptions entries. At TICK_SECONDS == 2.0
# this is roughly once a minute of wall-clock time — frequent enough that a
# newly-expired document surfaces promptly in the demo, cheap enough not to
# matter next to the per-tick work above.
KYC_CHECK_EVERY_N_TICKS = 30

logger = logging.getLogger("simulation")

TICK_SECONDS = 2.0
LOADING_DURATION_SECONDS = 90.0
TRANSIT_DURATION_SECONDS = 150.0
ALERT_SPAWN_PROBABILITY = 0.015

ALERT_TEMPLATES = [
    ("GPS signal degraded", AlertSeverity.warning, "Simulated GPS link quality drop for a tanker near {station}.", "GPS Simulator"),
    ("Meter calibration drift detected", AlertSeverity.warning, "Simulated flow meter drift exceeds 1.5% at {station}.", "PLC & Meter Simulator"),
    ("Edge gateway heartbeat delayed", AlertSeverity.info, "Simulated heartbeat from the {station} edge gateway arrived late.", "Edge Gateway"),
]

# IVMS (In-Vehicle Monitoring System) — driver-behavior event templates.
# SIMULATION MODE: synthetic telemetry only, never a real IVMS device or
# camera feed. Keyed by event_type -> (severity, message).
IVMS_EVENT_TEMPLATES = {
    "harsh_braking": ("warning", "Harsh braking detected"),
    "harsh_acceleration": ("warning", "Harsh acceleration detected"),
    "overspeeding": ("critical", "Posted speed limit exceeded"),
    "seatbelt_violation": ("warning", "Seatbelt not fastened while driving"),
    "fatigue_alert": ("critical", "Driver fatigue indicators detected"),
    "idle_prolonged": ("info", "Engine idling beyond threshold"),
}


@dataclass
class LoadingTelemetry:
    started_at: datetime
    flow_rate_l_min: float
    # Captured at creation so an RFID gate-out event can still be logged
    # with these details once the order leaves this engine's in-memory
    # loading dict (the Order/Tanker objects may be long gone by then).
    tanker_code: str | None = None
    station_name: str = ""
    rfid_tag_id: str | None = None


@dataclass
class TransitTelemetry:
    started_at: datetime
    origin: tuple
    destination: tuple
    geofence_exit_logged: bool = False
    geofence_arrival_logged: bool = False


class SimulationEngine:
    def __init__(self) -> None:
        self._loading: dict[str, LoadingTelemetry] = {}
        self._transit: dict[str, TransitTelemetry] = {}
        self._geofence_events: list[dict] = []
        self._flow_events: list[dict] = []
        self._offline_queue_depth: dict[str, int] = {}
        self._event_seq = 0
        self._tick_counter = 0
        # RFID-based vehicle tracking — gate-read event log, keyed off bay
        # entry/exit (see _tick_loading).
        self._rfid_events: list[dict] = []
        self._rfid_event_seq = 0
        # IVMS — per-tanker driving score / harsh-event tally persisted
        # across ticks (keyed by tanker id), and the cumulative event log.
        self._ivms_score: dict[str, float] = {}
        self._ivms_harsh_count: dict[str, int] = {}
        self._ivms_events: list[dict] = []
        self._ivms_event_seq = 0
        self._snapshot: dict = {
            "simulation_time": None,
            "is_paused": False,
            "speed_multiplier": 1,
            "loading": [],
            "transit": [],
            "geofence_events": [],
            "flow_events": [],
            "new_alerts": [],
            "stations": [],
            "rfid_events": [],
            "ivms_vehicles": [],
            "ivms_events": [],
            "generated_at": None,
        }
        self._subscribers: list[asyncio.Queue] = []
        self._task: "asyncio.Task | None" = None

    def start(self) -> None:
        if self._task is None:
            self._task = asyncio.create_task(self._run())
            logger.info("Simulation engine started (SIMULATION MODE — synthetic telemetry only)")

    def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            self._task = None

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1)
        self._subscribers.append(q)
        if q.empty():
            try:
                q.put_nowait(self._snapshot)
            except asyncio.QueueFull:
                pass
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        if q in self._subscribers:
            self._subscribers.remove(q)

    def get_snapshot(self) -> dict:
        return self._snapshot

    def set_station_offline(self, station_id: str) -> None:
        """Start (or continue) queueing this station's telemetry instead of forwarding it live."""
        self._offline_queue_depth.setdefault(station_id, 0)

    def set_station_online(self, station_id: str) -> int:
        """Flush the queue built up while offline and return how many readings were queued."""
        count = self._offline_queue_depth.pop(station_id, 0)
        if count:
            self._flow_events.append(self._mk_event(
                f"gateway:{station_id}", "order_service", "sync_flush",
                f"{count} queued readings synced", datetime.now(timezone.utc).isoformat(),
            ))
            self._flow_events = self._flow_events[-100:]
        return count

    async def _run(self) -> None:
        while True:
            try:
                await self._tick()
            except Exception:  # pragma: no cover - keep the loop alive
                logger.exception("Simulation tick failed")
            await asyncio.sleep(TICK_SECONDS)

    async def _tick(self) -> None:
        db = SessionLocal()
        try:
            self._tick_counter += 1
            settings = db.get(SimulationSettings, 1)
            if settings is None:
                settings = SimulationSettings(id=1)
                db.add(settings)
                db.commit()
                db.refresh(settings)

            if not settings.is_paused:
                settings.simulation_time = settings.simulation_time + timedelta(minutes=settings.speed_multiplier)

            loading_orders = db.query(Order).filter(Order.status == OrderStatus.loading_in_progress).all()
            transit_orders = db.query(Order).filter(Order.status == OrderStatus.in_transit).all()
            now = datetime.now(timezone.utc)

            loading_snapshot = self._tick_loading(loading_orders, now, db)
            transit_snapshot = self._tick_transit(transit_orders, now)

            new_alerts = []
            if random.random() < ALERT_SPAWN_PROBABILITY:
                alert = self._maybe_spawn_alert(db)
                if alert:
                    new_alerts.append({"id": alert.id, "title": alert.title, "severity": alert.severity.value})

            if self._tick_counter % KYC_CHECK_EVERY_N_TICKS == 0:
                for kyc_alert in kyc_service.check_kyc_alerts(db):
                    new_alerts.append({"id": kyc_alert.id, "title": kyc_alert.title, "severity": kyc_alert.severity.value})

            self._tick_flow_events(db, loading_snapshot, transit_snapshot, new_alerts, now)
            station_snapshot = self._tick_stations(db)
            ivms_snapshot = self._tick_ivms(db, loading_snapshot, transit_snapshot, now)

            db.commit()

            self._snapshot = {
                "simulation_time": settings.simulation_time.isoformat(),
                "is_paused": settings.is_paused,
                "speed_multiplier": settings.speed_multiplier,
                "loading": loading_snapshot,
                "transit": transit_snapshot,
                "geofence_events": self._geofence_events[-20:],
                "flow_events": self._flow_events[-40:],
                "new_alerts": new_alerts,
                "stations": station_snapshot,
                "rfid_events": self._rfid_events[-30:],
                "ivms_vehicles": ivms_snapshot,
                "ivms_events": self._ivms_events[-40:],
                "generated_at": now.isoformat(),
            }
            await self._broadcast()
        finally:
            db.close()

    def _tick_loading(self, loading_orders, now, db) -> list[dict]:
        snapshot = []
        seen = set()
        for order in loading_orders:
            seen.add(order.id)
            tel = self._loading.get(order.id)
            if tel is None:
                tanker_code = order.tanker.tanker_code if order.tanker else None
                rfid_tag_id = order.tanker.rfid_tag_id if order.tanker else None
                tel = LoadingTelemetry(
                    started_at=now,
                    flow_rate_l_min=random.uniform(800, 1400),
                    tanker_code=tanker_code,
                    station_name=order.station.name,
                    rfid_tag_id=rfid_tag_id,
                )
                self._loading[order.id] = tel
                self._log_rfid_event(tel, "in")
            elapsed = (now - tel.started_at).total_seconds()
            target = order.authorized_quantity_l or order.requested_quantity_l
            progress = max(0.0, min(1.0, elapsed / LOADING_DURATION_SECONDS))
            jitter = random.uniform(-0.01, 0.01)
            live_volume = max(0, round(target * max(0.0, min(1.0, progress + jitter))))
            bay = db.get(LoadingBay, order.loading_bay_id) if order.loading_bay_id else None
            snapshot.append({
                "order_id": order.id,
                "order_number": order.order_number,
                "station_id": order.station_id,
                "station_name": order.station.name,
                "bay_code": bay.bay_code if bay else None,
                "tanker_code": order.tanker.tanker_code if order.tanker else None,
                "product": order.product.value,
                "target_volume_l": target,
                "live_volume_l": live_volume,
                "progress_pct": round(progress * 100, 1),
                "flow_rate_l_min": round(tel.flow_rate_l_min, 1),
                "ready_to_complete": progress >= 0.98,
                # The physical meter keeps counting even if the edge gateway's
                # WAN link is down (SIMULATION MODE) — readings just queue
                # locally instead of reaching the central services live.
                "station_offline": order.station.connectivity_status == ConnectivityStatus.offline,
                "rfid_tag_id": tel.rfid_tag_id,
            })
        for oid in list(self._loading.keys()):
            if oid not in seen:
                self._log_rfid_event(self._loading[oid], "out")
                del self._loading[oid]
        return snapshot

    def _tick_transit(self, transit_orders, now) -> list[dict]:
        snapshot = []
        seen = set()
        for order in transit_orders:
            seen.add(order.id)
            tel = self._transit.get(order.id)
            if tel is None:
                # The route starts at the order's actual station — the
                # same real-world coordinates the live map draws that
                # station's marker at (see geo.STATION_COORDS) — rather
                # than the tanker's last random position, so the animated
                # route always begins at the correct pin on the map.
                origin = STATION_COORDS.get(order.station.name) if order.station else None
                if origin is None:
                    tanker = order.tanker
                    origin = (
                        float(tanker.last_lat) if tanker and tanker.last_lat is not None else 23.6,
                        float(tanker.last_lon) if tanker and tanker.last_lon is not None else 58.5,
                    )
                rnd = random.Random(order.id)
                # The synthetic delivery point is a nearby jitter that is
                # guaranteed to land on Oman's mainland (never out at sea).
                destination = land_jitter(origin[0], origin[1], rnd, max_offset=0.6)
                tel = TransitTelemetry(started_at=now, origin=origin, destination=destination)
                self._transit[order.id] = tel

            elapsed = (now - tel.started_at).total_seconds()
            progress = max(0.0, min(1.0, elapsed / TRANSIT_DURATION_SECONDS))
            lat = tel.origin[0] + (tel.destination[0] - tel.origin[0]) * progress
            lon = tel.origin[1] + (tel.destination[1] - tel.origin[1]) * progress

            if order.tanker:
                order.tanker.last_lat = round(lat, 6)
                order.tanker.last_lon = round(lon, 6)
                order.tanker.last_comm_at = now

            if progress > 0.03 and not tel.geofence_exit_logged:
                tel.geofence_exit_logged = True
                self._log_geofence_event(order, "exit", order.station.name)
            if progress > 0.95 and not tel.geofence_arrival_logged:
                tel.geofence_arrival_logged = True
                self._log_geofence_event(order, "arrival", "Delivery zone")

            snapshot.append({
                "order_id": order.id,
                "order_number": order.order_number,
                "tanker_code": order.tanker.tanker_code if order.tanker else None,
                "station_name": order.station.name,
                "progress_pct": round(progress * 100, 1),
                "lat": round(lat, 6),
                "lon": round(lon, 6),
                "eta_minutes": round(max(0.0, (TRANSIT_DURATION_SECONDS - elapsed) / 60), 1),
            })
        for oid in list(self._transit.keys()):
            if oid not in seen:
                del self._transit[oid]
        return snapshot

    def _tick_stations(self, db) -> list[dict]:
        stations = db.query(Station).order_by(Station.name).all()
        return [
            {
                "station_id": s.id,
                "station_name": s.name,
                "connectivity_status": s.connectivity_status.value,
                "queued_event_count": self._offline_queue_depth.get(s.id, 0),
                "last_heartbeat": s.last_heartbeat.isoformat() if s.last_heartbeat else None,
            }
            for s in stations
        ]

    def _mk_event(self, source: str, target: str, kind: str, label: str, ts: str) -> dict:
        self._event_seq += 1
        return {"id": str(self._event_seq), "from": source, "to": target, "type": kind, "label": label, "timestamp": ts}

    def _tick_flow_events(self, db, loading_snapshot: list[dict], transit_snapshot: list[dict], new_alerts: list[dict], now: datetime) -> None:
        """
        Derives the "who talked to whom" events shown on the Interactive
        Data Flow diagram directly from this tick's already-computed
        telemetry — no separate event log is persisted, keeping this
        purely a visualization of activity that already happened.
        """
        ts = now.isoformat()
        events: list[dict] = []

        for item in loading_snapshot:
            sid = item["station_id"]
            if item["station_offline"]:
                # Queued at the edge instead of forwarded — no live flow
                # event, just a growing queue depth until reconnect.
                self._offline_queue_depth[sid] = self._offline_queue_depth.get(sid, 0) + 1
                continue
            events.append(self._mk_event(f"plc:{sid}", f"gateway:{sid}", "meter_reading", f"{item['live_volume_l']:,} L", ts))
            events.append(self._mk_event(f"gateway:{sid}", "order_service", "telemetry_ingest", item["order_number"], ts))
            if self._tick_counter % 4 == 0:
                events.append(self._mk_event(f"gateway:{sid}", "dashboard_service", "telemetry_forward", item["station_name"], ts))

        for item in transit_snapshot:
            events.append(self._mk_event("gps_service", "order_service", "gps_ping", f"{item['tanker_code']} · {item['progress_pct']:.0f}%", ts))

        for alert in new_alerts:
            events.append(self._mk_event("alert_engine", "dashboard_service", "alert_surface", alert["title"], ts))

        if loading_snapshot or transit_snapshot:
            events.append(self._mk_event(
                "order_service", "audit_service", "audit_write",
                f"{len(loading_snapshot) + len(transit_snapshot)} active operations", ts,
            ))
            events.append(self._mk_event("order_service", "dashboard_service", "kpi_update", "KPIs refreshed", ts))

        pending_auth_count = db.query(Order).filter(Order.status == OrderStatus.awaiting_authorization).count()
        if pending_auth_count:
            events.append(self._mk_event(
                "order_service", "auth_service", "authorization_check", f"{pending_auth_count} pending", ts,
            ))

        self._flow_events.extend(events)
        self._flow_events = self._flow_events[-100:]

    def _log_geofence_event(self, order, kind: str, zone_name: str) -> None:
        self._geofence_events.append({
            "id": f"{order.id[:8]}-{kind}",
            "order_number": order.order_number,
            "tanker_code": order.tanker.tanker_code if order.tanker else None,
            "kind": kind,
            "zone_name": zone_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self._geofence_events = self._geofence_events[-50:]

    def _log_rfid_event(self, tel: LoadingTelemetry, gate: str) -> None:
        """RFID-based vehicle tracking — a tanker's tag read by the (simulated)
        station bay gate reader on entry (loading starts) or exit (loading
        ends). SIMULATION MODE: synthetic tag reads only."""
        self._rfid_event_seq += 1
        self._rfid_events.append({
            "id": f"rfid-{self._rfid_event_seq}",
            "tanker_code": tel.tanker_code,
            "rfid_tag_id": tel.rfid_tag_id,
            "station_name": tel.station_name,
            "gate": gate,
            "reader": f"{tel.station_name} Bay Gate Reader",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })
        self._rfid_events = self._rfid_events[-30:]

    def _log_ivms_event(self, tanker_code: str | None, driver_name: str | None, event_type: str, now: datetime) -> None:
        severity, message = IVMS_EVENT_TEMPLATES[event_type]
        self._ivms_event_seq += 1
        self._ivms_events.append({
            "id": f"ivms-{self._ivms_event_seq}",
            "tanker_code": tanker_code,
            "driver_name": driver_name,
            "event_type": event_type,
            "severity": severity,
            "message": message,
            "timestamp": now.isoformat(),
        })
        self._ivms_events = self._ivms_events[-40:]

    def _tick_ivms(self, db, loading_snapshot: list[dict], transit_snapshot: list[dict], now: datetime) -> list[dict]:
        """
        IVMS (In-Vehicle Monitoring System) — SIMULATION MODE. Derives a
        driver-behavior telemetry row for every tanker in the fleet each
        tick: current speed/engine state (from whether it's actively
        driving or loading this tick, matched by tanker_code against the
        telemetry already computed above), occasional harsh-driving/
        seatbelt/fatigue events, and a running driving score. Never
        connected to a real IVMS device, dash-cam, or telematics unit.
        """
        driving_codes = {i["tanker_code"] for i in transit_snapshot if i["tanker_code"]}
        loading_codes = {i["tanker_code"] for i in loading_snapshot if i["tanker_code"]}
        tankers = db.query(Tanker).order_by(Tanker.tanker_code).all()

        vehicles: list[dict] = []
        for t in tankers:
            score = self._ivms_score.get(t.id, 100.0)
            harsh_count = self._ivms_harsh_count.get(t.id, 0)
            driver_name = t.driver.display_name if t.driver else None

            if t.tanker_code in driving_codes:
                engine_status = "running"
                speed = round(random.uniform(55, 95), 1)
                seatbelt = random.random() > 0.04
                if not seatbelt:
                    self._log_ivms_event(t.tanker_code, driver_name, "seatbelt_violation", now)
                if speed > 90 and random.random() < 0.15:
                    speed = round(random.uniform(96, 112), 1)
                    self._log_ivms_event(t.tanker_code, driver_name, "overspeeding", now)
                    score = max(0.0, score - 4)
                    harsh_count += 1
                elif random.random() < 0.02:
                    kind = random.choice(["harsh_braking", "harsh_acceleration"])
                    self._log_ivms_event(t.tanker_code, driver_name, kind, now)
                    score = max(0.0, score - 3)
                    harsh_count += 1
                elif random.random() < 0.006:
                    self._log_ivms_event(t.tanker_code, driver_name, "fatigue_alert", now)
                    score = max(0.0, score - 6)
                    harsh_count += 1
                else:
                    score = min(100.0, score + 0.3)
            elif t.tanker_code in loading_codes:
                engine_status = "idle"
                speed = 0.0
                seatbelt = True
                if random.random() < 0.01:
                    self._log_ivms_event(t.tanker_code, driver_name, "idle_prolonged", now)
                score = min(100.0, score + 0.1)
            else:
                engine_status = "off"
                speed = 0.0
                seatbelt = True
                score = min(100.0, score + 0.1)

            fatigue_level = "alert" if score < 70 else "caution" if score < 85 else "normal"

            self._ivms_score[t.id] = score
            self._ivms_harsh_count[t.id] = harsh_count

            vehicles.append({
                "tanker_id": t.id,
                "tanker_code": t.tanker_code,
                "driver_name": driver_name,
                "status": t.status.value,
                "engine_status": engine_status,
                "speed_kmh": speed,
                "seatbelt_fastened": seatbelt,
                "driving_score": round(score, 1),
                "harsh_events_session": harsh_count,
                "fatigue_level": fatigue_level,
            })
        return vehicles

    def _maybe_spawn_alert(self, db) -> "Alert | None":
        stations = db.query(Station).all()
        if not stations:
            return None
        station = random.choice(stations)
        title, severity, desc_tpl, source = random.choice(ALERT_TEMPLATES)
        alert = Alert(
            severity=severity,
            title=title,
            description=desc_tpl.format(station=station.name),
            source=source,
            related_station_id=station.id,
            recommended_action="Review in Alerts & Exceptions. Simulated telemetry — no physical action required.",
        )
        db.add(alert)
        db.flush()
        return alert

    async def _broadcast(self) -> None:
        for q in list(self._subscribers):
            try:
                if q.full():
                    q.get_nowait()
                q.put_nowait(self._snapshot)
            except Exception:
                pass


engine = SimulationEngine()
