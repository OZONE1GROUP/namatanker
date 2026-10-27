"""
Phase 7 — demo authentication endpoints. SIMULATION MODE: backs onto a
handful of seeded demo accounts (app/seed.py), not a production identity
provider. /auth/demo-users intentionally returns demo passwords in plain
text — these are synthetic demo credentials with no real-world value,
published so the login page can offer one-click "Log in as <role>" buttons.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth_deps import get_current_user
from app.config import get_settings
from app.database import get_db
from app.models.core import User
from app.models.enums import UserRole
from app.schemas.auth import DemoUserOut, LoginRequest, TokenResponse, UserOut
from app.security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()

ROLE_LABELS: dict[UserRole, tuple[str, str]] = {
    UserRole.operator: ("Terminal Operator", "Runs day-to-day order and loading workflow at the station."),
    UserRole.authorization_officer: ("Authorization Officer", "Issues or rejects loading authorizations."),
    UserRole.fleet_manager: ("Fleet & Stations Manager", "Manages tankers, stations, and edge-gateway connectivity."),
    UserRole.auditor: ("Compliance Auditor", "Read-only visibility across orders, audit trail, and reports."),
    UserRole.admin: ("System Administrator", "Full access, including simulation clock controls."),
}


def _user_out(user: User) -> UserOut:
    return UserOut(id=user.id, username=user.username, display_name=user.display_name, role=user.role.value)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == payload.username))
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Incorrect username or password.")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token(user_id=user.id, username=user.username, role=user.role.value)
    return TokenResponse(access_token=token, expires_in_minutes=settings.jwt_expire_minutes, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return _user_out(current_user)


@router.get("/demo-users", response_model=list[DemoUserOut])
def demo_users(db: Session = Depends(get_db)):
    users = db.execute(select(User).order_by(User.role)).scalars().all()
    out = []
    for u in users:
        label, description = ROLE_LABELS.get(u.role, (u.role.value, ""))
        out.append(
            DemoUserOut(
                username=u.username,
                password="demo123",
                display_name=u.display_name,
                role=u.role.value,
                role_label=label,
                description=description,
            )
        )
    return out
