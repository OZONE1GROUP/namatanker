from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user
from app.database import get_db
from app.models.core import Alert, AuditEntry, Order, Station, User
from app.models.enums import AlertStatus
from app.schemas.alerts import AlertActionResponse, AlertListItem, AlertListResponse

router = APIRouter(prefix="/alerts", tags=["alerts"])


def _to_item(db: Session, alert: Alert) -> AlertListItem:
    order_number = None
    if alert.related_order_id:
        order = db.get(Order, alert.related_order_id)
        order_number = order.order_number if order else None
    station_name = None
    if alert.related_station_id:
        station = db.get(Station, alert.related_station_id)
        station_name = station.name if station else None
    return AlertListItem(
        id=alert.id,
        severity=alert.severity.value,
        status=alert.status.value,
        title=alert.title,
        description=alert.description,
        source=alert.source,
        related_order_id=alert.related_order_id,
        related_order_number=order_number,
        related_station_id=alert.related_station_id,
        related_station_name=station_name,
        recommended_action=alert.recommended_action,
        created_at=alert.created_at,
        acknowledged_at=alert.acknowledged_at,
        resolved_at=alert.resolved_at,
    )


def _get_alert_or_404(db: Session, alert_id: str) -> Alert:
    alert = db.get(Alert, alert_id)
    if alert is None:
        raise HTTPException(404, "Alert not found")
    return alert


def _record_audit(db: Session, alert: Alert, action: str, previous: str, new: str, actor: str) -> None:
    db.add(
        AuditEntry(
            actor=actor,
            action=action,
            entity_type="alert",
            entity_id=alert.id,
            previous_state=previous,
            new_state=new,
        )
    )


@router.get("", response_model=AlertListResponse)
def list_alerts(
    db: Session = Depends(get_db),
    status: str | None = Query(default=None),
    severity: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    filters = []
    if status:
        filters.append(Alert.status == status)
    if severity:
        filters.append(Alert.severity == severity)

    base = select(Alert).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        db.execute(base.order_by(Alert.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
        .scalars()
        .all()
    )

    return AlertListResponse(
        items=[_to_item(db, a) for a in rows],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{alert_id}/acknowledge", response_model=AlertActionResponse)
def acknowledge_alert(alert_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = _get_alert_or_404(db, alert_id)
    if alert.status != AlertStatus.open:
        raise HTTPException(409, f"Alert is {alert.status.value}, cannot acknowledge.")
    previous = alert.status.value
    alert.status = AlertStatus.acknowledged
    alert.acknowledged_at = datetime.now(timezone.utc)
    _record_audit(db, alert, "acknowledge_alert", previous, alert.status.value, actor=current_user.display_name)
    db.commit()
    db.refresh(alert)
    return AlertActionResponse(alert=_to_item(db, alert), message="Alert acknowledged.")


@router.post("/{alert_id}/resolve", response_model=AlertActionResponse)
def resolve_alert(alert_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = _get_alert_or_404(db, alert_id)
    if alert.status == AlertStatus.resolved:
        raise HTTPException(409, "Alert is already resolved.")
    previous = alert.status.value
    alert.status = AlertStatus.resolved
    alert.resolved_at = datetime.now(timezone.utc)
    _record_audit(db, alert, "resolve_alert", previous, alert.status.value, actor=current_user.display_name)
    db.commit()
    db.refresh(alert)
    return AlertActionResponse(alert=_to_item(db, alert), message="Alert resolved.")


@router.post("/{alert_id}/escalate", response_model=AlertActionResponse)
def escalate_alert(alert_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    alert = _get_alert_or_404(db, alert_id)
    if alert.status == AlertStatus.resolved:
        raise HTTPException(409, "Cannot escalate a resolved alert.")
    previous = alert.status.value
    alert.status = AlertStatus.escalated
    _record_audit(db, alert, "escalate_alert", previous, alert.status.value, actor=current_user.display_name)
    db.commit()
    db.refresh(alert)
    return AlertActionResponse(alert=_to_item(db, alert), message="Alert escalated.")
