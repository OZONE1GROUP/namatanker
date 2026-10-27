"""
Phase 9 — Driver & Vehicle KYC compliance.

SIMULATION MODE: these are synthetic document numbers and validity dates
for demo purposes only — never a real identity/compliance verification
service. Scope (confirmed with the operator for this build):
  - Driver KYC = driving license + civil/resident ID, each with its own
    expiry date.
  - Vehicle KYC = vehicle registration (Istimara) + insurance, each with
    its own expiry date.
  - A driver or tanker with ANY expired KYC document is hard-blocked from
    being assigned to a new order (see services/orders.py `assign()`).
  - Expiring (within KYC_WARNING_WINDOW_DAYS) / expired documents raise
    entries in the Alerts & Exceptions module: a "warning" severity alert
    near expiry, upgraded to "critical" once actually expired, and
    auto-resolved if the document is renewed.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.core import Alert, Driver, Tanker
from app.models.enums import AlertSeverity, AlertStatus

KYC_WARNING_WINDOW_DAYS = 30

# Status strings used throughout (not a DB enum — computed on the fly from
# the stored expiry date, so there is a single source of truth and nothing
# can drift out of sync with "today").
STATUS_VALID = "valid"
STATUS_EXPIRING_SOON = "expiring_soon"
STATUS_EXPIRED = "expired"
STATUS_MISSING = "missing"

_RANK = {STATUS_VALID: 0, STATUS_MISSING: 1, STATUS_EXPIRING_SOON: 2, STATUS_EXPIRED: 3}

KYC_ALERT_SOURCE = "KYC Compliance Monitor"


def _today(today: date | None = None) -> date:
    return today or datetime.now(timezone.utc).date()


def kyc_status(expiry: date | None, today: date | None = None) -> str:
    """Classify a single document's expiry date."""
    if expiry is None:
        return STATUS_MISSING
    today = _today(today)
    if expiry < today:
        return STATUS_EXPIRED
    if expiry <= today + timedelta(days=KYC_WARNING_WINDOW_DAYS):
        return STATUS_EXPIRING_SOON
    return STATUS_VALID


def _worst(*statuses: str) -> str:
    return max(statuses, key=lambda s: _RANK[s])


@dataclass
class DriverKycStatus:
    civil_id_status: str
    license_status: str
    overall_status: str


@dataclass
class TankerKycStatus:
    registration_status: str
    insurance_status: str
    overall_status: str


def driver_kyc(driver: Driver, today: date | None = None) -> DriverKycStatus:
    civil = kyc_status(driver.civil_id_expiry, today)
    lic = kyc_status(driver.license_expiry, today)
    return DriverKycStatus(civil_id_status=civil, license_status=lic, overall_status=_worst(civil, lic))


def tanker_kyc(tanker: Tanker, today: date | None = None) -> TankerKycStatus:
    reg = kyc_status(tanker.registration_expiry, today)
    ins = kyc_status(tanker.insurance_expiry, today)
    return TankerKycStatus(registration_status=reg, insurance_status=ins, overall_status=_worst(reg, ins))


def driver_kyc_blocking_reason(driver: Driver, today: date | None = None) -> str | None:
    """None if the driver may be assigned; otherwise a human-readable reason naming the expired document."""
    status = driver_kyc(driver, today)
    if status.civil_id_status == STATUS_EXPIRED:
        return f"{driver.display_name}'s Civil ID expired on {driver.civil_id_expiry} and must be renewed before assignment."
    if status.license_status == STATUS_EXPIRED:
        return f"{driver.display_name}'s driving license expired on {driver.license_expiry} and must be renewed before assignment."
    return None


def tanker_kyc_blocking_reason(tanker: Tanker, today: date | None = None) -> str | None:
    """None if the tanker may be assigned; otherwise a human-readable reason naming the expired document."""
    status = tanker_kyc(tanker, today)
    if status.registration_status == STATUS_EXPIRED:
        return f"Tanker {tanker.tanker_code}'s vehicle registration expired on {tanker.registration_expiry} and must be renewed before assignment."
    if status.insurance_status == STATUS_EXPIRED:
        return f"Tanker {tanker.tanker_code}'s insurance expired on {tanker.insurance_expiry} and must be renewed before assignment."
    return None


_OPEN_STATUSES = [AlertStatus.open, AlertStatus.acknowledged, AlertStatus.escalated]


def _sync_kyc_alert(
    db: Session,
    *,
    title: str,
    status: str,
    description: str,
    driver_id: str | None = None,
    tanker_id: str | None = None,
) -> Alert | None:
    """
    Create/update/auto-resolve the single open alert for one (title, entity)
    pair, keyed by a constant title per document so severity can be upgraded
    in place (warning -> critical) instead of spawning duplicates, and
    auto-resolved once the document is renewed.
    """
    stmt = select(Alert).where(Alert.title == title, Alert.status.in_(_OPEN_STATUSES))
    stmt = stmt.where(Alert.related_driver_id == driver_id) if driver_id else stmt.where(Alert.related_tanker_id == tanker_id)
    existing = db.execute(stmt).scalars().first()

    if status not in (STATUS_EXPIRING_SOON, STATUS_EXPIRED):
        if existing is not None:
            existing.status = AlertStatus.resolved
            existing.resolved_at = datetime.now(timezone.utc)
        return None

    severity = AlertSeverity.critical if status == STATUS_EXPIRED else AlertSeverity.warning
    if existing is not None:
        if existing.severity != severity or existing.description != description:
            existing.severity = severity
            existing.description = description
        return None

    alert = Alert(
        severity=severity,
        status=AlertStatus.open,
        title=title,
        description=description,
        source=KYC_ALERT_SOURCE,
        related_driver_id=driver_id,
        related_tanker_id=tanker_id,
        recommended_action="Renew the document and update its number/expiry date on the driver or vehicle's KYC record.",
    )
    db.add(alert)
    db.flush()  # assigns alert.id so callers (seed.py, the simulation tick) can use it immediately
    return alert


def check_kyc_alerts(db: Session, today: date | None = None) -> list[Alert]:
    """
    Scan every driver and tanker and sync (create/upgrade/resolve) their
    KYC compliance alerts. Safe to call repeatedly (e.g. from seed.py and
    from the simulation engine's periodic tick) — it never duplicates an
    already-open alert for the same document.
    """
    today = _today(today)
    created: list[Alert] = []

    for driver in db.execute(select(Driver)).scalars().all():
        status = driver_kyc(driver, today)
        a = _sync_kyc_alert(
            db,
            title="Driver Civil ID compliance",
            status=status.civil_id_status,
            description=(
                f"{driver.display_name} ({driver.driver_code})'s Civil ID "
                f"{'expired on' if status.civil_id_status == STATUS_EXPIRED else 'expires on'} {driver.civil_id_expiry}."
            ),
            driver_id=driver.id,
        )
        if a:
            created.append(a)

        a = _sync_kyc_alert(
            db,
            title="Driver License compliance",
            status=status.license_status,
            description=(
                f"{driver.display_name} ({driver.driver_code})'s driving license "
                f"{'expired on' if status.license_status == STATUS_EXPIRED else 'expires on'} {driver.license_expiry}."
            ),
            driver_id=driver.id,
        )
        if a:
            created.append(a)

    for tanker in db.execute(select(Tanker)).scalars().all():
        status = tanker_kyc(tanker, today)
        a = _sync_kyc_alert(
            db,
            title="Vehicle Registration compliance",
            status=status.registration_status,
            description=(
                f"Tanker {tanker.tanker_code}'s vehicle registration (Istimara) "
                f"{'expired on' if status.registration_status == STATUS_EXPIRED else 'expires on'} {tanker.registration_expiry}."
            ),
            tanker_id=tanker.id,
        )
        if a:
            created.append(a)

        a = _sync_kyc_alert(
            db,
            title="Vehicle Insurance compliance",
            status=status.insurance_status,
            description=(
                f"Tanker {tanker.tanker_code}'s insurance "
                f"{'expired on' if status.insurance_status == STATUS_EXPIRED else 'expires on'} {tanker.insurance_expiry}."
            ),
            tanker_id=tanker.id,
        )
        if a:
            created.append(a)

    return created
