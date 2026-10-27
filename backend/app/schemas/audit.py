from datetime import datetime

from pydantic import BaseModel


class AuditEntryListItem(BaseModel):
    id: str
    timestamp: datetime
    actor: str
    action: str
    entity_type: str
    entity_id: str
    previous_state: str | None
    new_state: str | None
    reason: str | None
    correlation_id: str | None

    model_config = {"from_attributes": True}


class AuditListResponse(BaseModel):
    items: list[AuditEntryListItem]
    total: int
    page: int
    page_size: int
