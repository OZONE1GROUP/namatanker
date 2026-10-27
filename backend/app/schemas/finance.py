from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class PricingOut(BaseModel):
    product: str
    price_per_liter: Decimal
    currency: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class PricingUpdateRequest(BaseModel):
    price_per_liter: Decimal = Field(gt=0)


class PlatformSettingsOut(BaseModel):
    commission_model: str
    platform_commission_pct: Decimal
    payment_gateway_enabled: bool
    payment_gateway_provider: str | None
    payment_gateway_mode: str
    payment_gateway_reference: str | None
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlatformSettingsUpdateRequest(BaseModel):
    platform_commission_pct: Decimal | None = Field(default=None, ge=0, le=100)
    payment_gateway_enabled: bool | None = None
    payment_gateway_provider: str | None = None
    payment_gateway_mode: str | None = None
    payment_gateway_reference: str | None = None


class TransactionOut(BaseModel):
    id: str
    transaction_number: str
    order_id: str | None
    order_number: str | None = None
    type: str
    category: str
    amount: Decimal
    currency: str
    counterparty_type: str
    counterparty_name: str
    commission_pct: Decimal | None
    commission_amount: Decimal | None
    net_amount: Decimal | None
    payment_method: str
    status: str
    description: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class TransactionListResponse(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int


class FinanceSummary(BaseModel):
    period_days: int
    total_inbound: Decimal
    total_outbound: Decimal
    platform_net_revenue: Decimal
    transaction_count: int
    orders_with_transactions: int


class StationCommissionRow(BaseModel):
    station_id: str
    station_name: str
    order_count: int
    gross_revenue: Decimal
    commission_amount: Decimal
    net_payout: Decimal


class CommissionReport(BaseModel):
    period_days: int
    rows: list[StationCommissionRow]
