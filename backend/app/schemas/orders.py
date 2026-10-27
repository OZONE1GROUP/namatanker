from datetime import datetime

from pydantic import BaseModel, Field


class OrderListItem(BaseModel):
    id: str
    order_number: str
    customer_name: str
    station_name: str
    product: str
    status: str
    requested_quantity_l: int
    tanker_code: str | None
    created_at: datetime
    order_value: float | None = None
    order_value_currency: str | None = None

    model_config = {"from_attributes": True}


class OrderListResponse(BaseModel):
    items: list[OrderListItem]
    total: int
    page: int
    page_size: int


class AuthorizationOut(BaseModel):
    id: str
    status: str
    max_authorized_quantity_l: int
    issuing_service: str
    correlation_id: str
    issued_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    verification_result: str | None

    model_config = {"from_attributes": True}


class AuditEntryOut(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    action: str
    previous_state: str | None
    new_state: str | None
    reason: str | None

    model_config = {"from_attributes": True}


class OrderDetail(BaseModel):
    id: str
    order_number: str
    status: str
    product: str

    customer_id: str
    customer_name: str
    station_id: str
    station_name: str
    tanker_id: str | None
    tanker_code: str | None
    driver_id: str | None
    driver_name: str | None
    loading_bay_id: str | None
    loading_bay_code: str | None

    requested_quantity_l: int
    authorized_quantity_l: int | None
    actual_loaded_quantity_l: int | None
    delivery_quantity_l: int | None

    authorization_reference: str | None
    exception_details: str | None

    created_at: datetime
    authorized_at: datetime | None
    loaded_at: datetime | None
    delivered_at: datetime | None

    authorization: AuthorizationOut | None
    audit_history: list[AuditEntryOut]

    available_actions: list[str]

    price_per_liter: float | None = None
    order_value: float | None = None
    order_value_currency: str | None = None


class CreateOrderRequest(BaseModel):
    customer_id: str
    station_id: str
    product: str
    requested_quantity_l: int = Field(gt=0)


class AssignRequest(BaseModel):
    tanker_id: str
    driver_id: str | None = None


class StartLoadingRequest(BaseModel):
    loading_bay_id: str


class CompleteLoadingRequest(BaseModel):
    actual_loaded_quantity_l: int = Field(gt=0)


class CompleteDeliveryRequest(BaseModel):
    delivery_quantity_l: int = Field(gt=0)


class ReasonRequest(BaseModel):
    reason: str = "Cancelled by operator"


class ActionResponse(BaseModel):
    order: OrderDetail
    message: str
