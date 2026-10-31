from pydantic import BaseModel, ConfigDict, Field


class FlowEventOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    source: str = Field(alias="from")
    target: str = Field(alias="to")
    type: str
    label: str
    timestamp: str


class LoadingTelemetryOut(BaseModel):
    order_id: str
    order_number: str
    station_id: str
    station_name: str
    bay_code: str | None
    tanker_code: str | None
    product: str
    target_volume_l: int
    live_volume_l: int
    progress_pct: float
    flow_rate_l_min: float
    ready_to_complete: bool
    station_offline: bool
    rfid_tag_id: str | None = None


class TransitTelemetryOut(BaseModel):
    order_id: str
    order_number: str
    tanker_code: str | None
    station_name: str
    progress_pct: float
    lat: float
    lon: float
    eta_minutes: float


class GeofenceEventOut(BaseModel):
    id: str
    order_number: str
    tanker_code: str | None
    kind: str
    zone_name: str
    timestamp: str


class StationConnectivityOut(BaseModel):
    station_id: str
    station_name: str
    connectivity_status: str
    queued_event_count: int
    last_heartbeat: str | None


class RfidEventOut(BaseModel):
    """RFID gate-read event — a tanker's tag scanned in or out of a station
    loading bay gate. SIMULATION MODE: synthetic tag reads only."""

    id: str
    tanker_code: str | None
    rfid_tag_id: str | None
    station_name: str
    gate: str  # "in" | "out"
    reader: str
    timestamp: str


class IvmsVehicleOut(BaseModel):
    """In-Vehicle Monitoring System — current driver-behavior telemetry for
    one tanker. SIMULATION MODE: synthetic telemetry, never a real IVMS
    device or camera feed."""

    tanker_id: str
    tanker_code: str
    driver_name: str | None
    status: str
    engine_status: str  # "running" | "idle" | "off"
    speed_kmh: float
    seatbelt_fastened: bool
    driving_score: float
    harsh_events_session: int
    fatigue_level: str  # "normal" | "caution" | "alert"


class IvmsEventOut(BaseModel):
    id: str
    tanker_code: str | None
    driver_name: str | None
    event_type: str
    severity: str
    message: str
    timestamp: str


class LiveSnapshotOut(BaseModel):
    simulation_time: str | None
    is_paused: bool
    speed_multiplier: int
    loading: list[LoadingTelemetryOut]
    transit: list[TransitTelemetryOut]
    geofence_events: list[GeofenceEventOut]
    flow_events: list[FlowEventOut]
    stations: list[StationConnectivityOut]
    rfid_events: list[RfidEventOut] = []
    ivms_vehicles: list[IvmsVehicleOut] = []
    ivms_events: list[IvmsEventOut] = []
    generated_at: str | None


class SpeedRequest(BaseModel):
    speed_multiplier: int
