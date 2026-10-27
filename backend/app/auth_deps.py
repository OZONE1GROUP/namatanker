"""
Phase 7 — shared FastAPI dependencies for authentication and role checks.

Usage:
  - Require any logged-in user on a whole router:
      app.include_router(x.router, prefix="/api", dependencies=[Depends(get_current_user)])
  - Require a specific role on one route (in addition to the router-level
    login check above):
      @router.post(..., dependencies=[Depends(require_role(UserRole.admin))])
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.core import User
from app.models.enums import UserRole
from app.security import TokenError, decode_access_token

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="SIMULATION MODE demo auth — paste the access_token returned by POST /api/auth/login.",
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated. Log in and include the access token.")
    try:
        payload = decode_access_token(credentials.credentials)
    except TokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(e))

    user = db.get(User, payload.get("sub"))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account no longer exists.")
    return user


def require_role(*roles: UserRole):
    allowed = set(roles)

    def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed:
            allowed_names = ", ".join(r.value for r in allowed)
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"This action requires one of these roles: {allowed_names}. "
                f"Your role is '{user.role.value}'.",
            )
        return user

    return _checker
