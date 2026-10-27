from datetime import datetime

from pydantic import BaseModel


class TankerListItem(BaseModel):
    id: str
    tanker_code: str
    registration_number: str
    capacity_l: int
    assigned_product: str
    status: str
    gps_signal_ok: bool
    driver_name: str | None
    current_order_number: str | None

    model_config = {"from_attributes": True}


class RecentOrderSummary(BaseModel):
    id: str
    order_number: str
    status: str
    station_name: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TankerDetail(BaseModel):
    id: str
    tanker_code: str
    registration_number: str
    capacity_l: int
    assigned_product: str
    status: str
    gps_signal_ok: bool
    last_lat: float | None
    last_lon: float | None
    last_comm_at: datetime | None
    driver_id: str | None
    driver_name: str | None
    recent_orders: list[RecentOrderSummary]


class DriverListItem(BaseModel):
    id: str
    driver_code: str
    display_name: str
    duty_status: str
    qualification_status: str
    assigned_tanker_code: str | None

    model_config = {"from_attributes": True}
