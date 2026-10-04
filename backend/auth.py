import hashlib
import secrets

from fastapi import Cookie, Depends, HTTPException
from sqlmodel import Session

from .database import get_session
from .models import User, UserSession

SESSION_COOKIE = "session_token"
PBKDF2_ITERATIONS = 200_000


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), PBKDF2_ITERATIONS).hex()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str) -> bool:
    salt, _ = stored.split("$", 1)
    return secrets.compare_digest(hash_password(password, salt), stored)


def create_session(user_id: int, session: Session) -> str:
    token = secrets.token_urlsafe(32)
    session.add(UserSession(token=token, user_id=user_id))
    session.commit()
    return token


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    session: Session = Depends(get_session),
) -> User:
    if not session_token:
        raise HTTPException(status_code=401, detail="Not logged in")
    record = session.get(UserSession, session_token)
    user = session.get(User, record.user_id) if record else None
    if not user:
        raise HTTPException(status_code=401, detail="Session expired")
    return user
