from datetime import datetime
from decimal import Decimal
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


class FinanceOverview(BaseModel):
    """Phase 8 module report — mirrors finance.FinanceSummary but scoped to the dashboard's own days filter."""

    period_days: int
    total_inbound: Decimal
    total_outbound: Decimal
    platform_net_revenue: Decimal
    transaction_count: int


class KycBucket(BaseModel):
    valid: int
    expiring_soon: int
    expired: int
    missing: int


class KycOverview(BaseModel):
    """Phase 9 module report — driver/vehicle KYC compliance, aggregated across the whole fleet/roster."""

    drivers_total: int
    drivers: KycBucket
    tankers_total: int
    tankers: KycBucket


class ConnectivityOverview(BaseModel):
    online: int
    degraded: int
    offline: int


class DailyCount(BaseModel):
    date: str
    count: int


class AuditOverview(BaseModel):
    actions_last_24h: int
    actions_last_7d: int
    trend: list[DailyCount]


class DashboardResponse(BaseModel):
    simulation_time: datetime
    kpis: DashboardKpis
    orders_by_status: list[StatusCount]
    volume_by_station: list[StationVolume]
    daily_throughput: list[DailyThroughputPoint]
    tanker_activity: list[TankerActivityCount]
    insights: list[ExecutiveInsight]
    finance: FinanceOverview
    kyc: KycOverview
    connectivity: ConnectivityOverview
    audit: AuditOverview


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
