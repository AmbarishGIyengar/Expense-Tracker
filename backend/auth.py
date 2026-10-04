import hashlib
import hmac
import os
import re
import secrets

from fastapi import Depends, HTTPException, Request
from sqlmodel import Session, select

from .database import get_session
from .models import User

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PBKDF2_ITERATIONS = 260_000


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, password_hash: str) -> bool:
    salt, _, digest_hex = password_hash.partition("$")
    expected = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return hmac.compare_digest(expected.hex(), digest_hex)


def validate_credentials(email: str, password: str) -> None:
    if not EMAIL_RE.match(email or ""):
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if not password or len(password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")


def get_current_user(request: Request, session: Session = Depends(get_session)) -> User:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not signed in")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


# ponytail: SECRET_KEY falls back to a fixed dev value so sessions survive
# reloads without extra setup. Set the env var for any real deployment —
# otherwise anyone who reads this file can forge session cookies.
SESSION_SECRET = os.environ.get("SECRET_KEY", "dev-only-insecure-secret-change-me")
