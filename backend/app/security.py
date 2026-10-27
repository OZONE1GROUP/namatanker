"""
Phase 7 — password hashing and JWT helpers for the demo auth system.
SIMULATION MODE: these are standard, real cryptographic primitives (bcrypt,
HS256-signed JWTs) used correctly, but the identity store behind them is a
handful of seeded demo accounts (app/seed.py), not a production user
directory — there is no SSO, MFA, or password-reset flow here.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from app.config import get_settings

settings = get_settings()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(*, user_id: str, username: str, role: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expire_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class TokenError(ValueError):
    """Raised for any invalid, expired, or malformed token."""


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError:
        raise TokenError("Token has expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise TokenError("Invalid authentication token.")
