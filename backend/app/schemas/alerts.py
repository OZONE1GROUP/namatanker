from datetime import datetime

from pydantic import BaseModel


class AlertListItem(BaseModel):
    id: str
    severity: str
    status: str
    title: str
    description: str
    source: str
    related_order_id: str | None
    related_order_number: str | None
    related_station_id: str | None
    related_station_name: str | None
    related_driver_id: str | None
    related_driver_name: str | None
    related_tanker_id: str | None
    related_tanker_code: str | None
    recommended_action: str | None
    created_at: datetime
    acknowledged_at: datetime | None
    resolved_at: datetime | None


class AlertListResponse(BaseModel):
    items: list[AlertListItem]
    total: int
    page: int
    page_size: int


class AlertActionResponse(BaseModel):
    alert: AlertListItem
    message: str
