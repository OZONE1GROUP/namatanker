from datetime import datetime

from pydantic import BaseModel


class StationListItem(BaseModel):
    id: str
    station_code: str
    name: str
    location: str
    loading_bay_count: int
    connectivity_status: str
    last_heartbeat: datetime | None
    active_orders: int
    completed_orders: int
    unresolved_exceptions: int

    model_config = {"from_attributes": True}


class LoadingBayOut(BaseModel):
    id: str
    bay_code: str
    status: str
    current_order_number: str | None
    current_order_id: str | None

    model_config = {"from_attributes": True}


class StationOrderSummary(BaseModel):
    id: str
    order_number: str
    status: str
    product: str
    tanker_code: str | None

    model_config = {"from_attributes": True}


class StationDetail(BaseModel):
    id: str
    station_code: str
    name: str
    location: str
    loading_bay_count: int
    connectivity_status: str
    last_heartbeat: datetime | None
    edge_gateway_id: str | None
    loading_bays: list[LoadingBayOut]
    active_orders: list[StationOrderSummary]
    completed_orders_count: int
    throughput_volume_l: int


class StationConnectivityActionResponse(BaseModel):
    station_id: str
    connectivity_status: str
    message: str
