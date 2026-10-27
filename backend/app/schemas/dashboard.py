from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DashboardKpis(BaseModel):
    total_orders: int
    orders_awaiting_authorization: int
    authorized_orders: int
    active_loading_operations: int
    tankers_in_transit: int
    completed_deliveries: int
    total_volume_loaded_l: int
    volume_delivered_l: int
    reconciliation_exceptions: int
    connected_stations: int
    offline_stations: int
    critical_alerts: int


class StatusCount(BaseModel):
    status: str
    count: int


class StationVolume(BaseModel):
    station_name: str
    volume_l: int


class DailyThroughputPoint(BaseModel):
    date: str
    orders: int
    volume_l: int


class TankerActivityCount(BaseModel):
    status: str
    count: int


class ExecutiveInsight(BaseModel):
    id: str
    severity: Literal["info", "warning", "critical"]
    message: str
    entity_type: str
    entity_id: str
    entity_label: str


class DashboardResponse(BaseModel):
    simulation_time: datetime
    kpis: DashboardKpis
    orders_by_status: list[StatusCount]
    volume_by_station: list[StationVolume]
    daily_throughput: list[DailyThroughputPoint]
    tanker_activity: list[TankerActivityCount]
    insights: list[ExecutiveInsight]


class StationOut(BaseModel):
    id: str
    name: str
    location: str
    connectivity_status: str

    model_config = {"from_attributes": True}


class SimulationStatusOut(BaseModel):
    simulation_time: datetime
    speed_multiplier: int
    is_paused: bool
    mode: str
