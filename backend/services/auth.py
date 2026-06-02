import os
import hmac
import hashlib
import base64
import jwt
from datetime import datetime, timedelta
from typing import Optional

SECRET_KEY = os.getenv("JWT_SECRET", "")
if not SECRET_KEY:
    import logging as _logging
    _logging.getLogger(__name__).critical(
        "JWT_SECRET env var is not set — using insecure fallback. Set this in production!"
    )
    SECRET_KEY = "dev-secret-change-in-production-ism-2024"
ALGORITHM = "HS256"
TOKEN_EXPIRE_HOURS = 24
_ITERATIONS = 200_000


def hash_password(password: str) -> str:
    salt = os.urandom(32)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return base64.b64encode(salt + key).decode("utf-8")


def verify_password(plain: str, stored: str) -> bool:
    try:
        data = base64.b64decode(stored.encode("utf-8"))
        salt, key = data[:32], data[32:]
        new_key = hashlib.pbkdf2_hmac("sha256", plain.encode("utf-8"), salt, _ITERATIONS)
        return hmac.compare_digest(key, new_key)
    except Exception:
        return False


def create_token(user_id: int, role: str, org_id: Optional[int]) -> str:
    expire = datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS)
    payload = {
        "sub": str(user_id),
        "role": role,
        "org_id": org_id,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as e:
        raise ValueError(f"Token inválido: {e}")
