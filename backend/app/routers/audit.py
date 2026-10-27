from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import AuditEntry
from app.schemas.audit import AuditEntryListItem, AuditListResponse

router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("", response_model=AuditListResponse)
def list_audit_entries(
    db: Session = Depends(get_db),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    action: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
):
    filters = []
    if entity_type:
        filters.append(AuditEntry.entity_type == entity_type)
    if entity_id:
        filters.append(AuditEntry.entity_id == entity_id)
    if action:
        filters.append(AuditEntry.action == action)

    base = select(AuditEntry).where(*filters)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = db.execute(
        base.order_by(AuditEntry.timestamp.desc()).offset((page - 1) * page_size).limit(page_size)
    ).scalars().all()

    return AuditListResponse(
        items=[AuditEntryListItem.model_validate(r) for r in rows],
        total=total,
        page=page,
        page_size=page_size,
    )
