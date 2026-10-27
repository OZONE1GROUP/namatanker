from datetime import date, datetime

from pydantic import BaseModel, Field


class DriverKycOut(BaseModel):
    """Phase 9 — driver KYC: license + civil/resident ID, each with its own expiry. SIMULATION MODE demo data."""

    civil_id_number: str | None
    civil_id_expiry: date | None
    civil_id_status: str
    license_number: str | None
    license_expiry: date | None
    license_status: str
    overall_status: str


class TankerKycOut(BaseModel):
    """Phase 9 — vehicle KYC: registration (Istimara) + insurance, each with its own expiry. SIMULATION MODE demo data."""

    registration_expiry: date | None
    registration_status: str
    insurance_number: str | None
    insurance_expiry: date | None
    insurance_status: str
    overall_status: str


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
    kyc_status: str

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
    kyc: TankerKycOut


class DriverListItem(BaseModel):
    id: str
    driver_code: str
    display_name: str
    duty_status: str
    qualification_status: str
    assigned_tanker_code: str | None
    kyc: DriverKycOut

    model_config = {"from_attributes": True}


class CreateDriverRequest(BaseModel):
    """
    Phase 9 — new driver registration. SIMULATION MODE: civil_id_number and
    license_number are synthetic demo document numbers, never verified
    against any real government or licensing system.
    """

    display_name: str = Field(min_length=1, max_length=120)
    civil_id_number: str = Field(min_length=1, max_length=32)
    civil_id_expiry: date
    license_number: str = Field(min_length=1, max_length=32)
    license_expiry: date
    qualification_status: str = Field(default="Certified", max_length=64)


class CreateTankerRequest(BaseModel):
    """
    Phase 9 — new vehicle (tanker) registration. SIMULATION MODE:
    registration_number (Istimara) and insurance_number are synthetic demo
    document numbers, never verified against any real registry or insurer.
    """

    registration_number: str = Field(min_length=1, max_length=32)
    registration_expiry: date
    insurance_number: str = Field(min_length=1, max_length=32)
    insurance_expiry: date
    capacity_l: int = Field(gt=0)
    assigned_product: str
