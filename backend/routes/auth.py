import os
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from pydantic import BaseModel
from database import get_session
from models import User, Organization
from services.auth import verify_password, create_token, decode_token

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60
_RATE_MAX = 5


def _check_rate_limit(ip: str):
    now = time.time()
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < _RATE_WINDOW]
    if len(_login_attempts[ip]) >= _RATE_MAX:
        raise HTTPException(status_code=429, detail="Demasiados intentos. Intenta en 1 minuto.")
    _login_attempts[ip].append(now)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: str
    password: str


def _decode_or_401(token: str) -> dict:
    try:
        return decode_token(token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session),
) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    payload = _decode_or_401(credentials.credentials)
    user = session.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no encontrado o desactivado")
    return user


def require_write_access(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role == "viewer":
        raise HTTPException(status_code=403, detail="Acceso de solo lectura")
    return current_user


def require_superadmin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "superadmin":
        raise HTTPException(status_code=403, detail="Solo superadmin puede acceder")
    return current_user


@router.post("/login")
def login(req: LoginRequest, request: Request, session: Session = Depends(get_session)):
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = forwarded_for.split(",")[0].strip() if forwarded_for else (request.client.host if request.client else "unknown")
    _check_rate_limit(client_ip)
    user = session.exec(select(User).where(User.email == req.email)).first()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales incorrectas")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario desactivado")
    token = create_token(user.id, user.role, user.organization_id)
    logger.info(f"Login: {user.email} ({user.role})")
    return {"access_token": token, "token_type": "bearer"}


@router.post("/logout")
def logout():
    return {"ok": True}


@router.get("/me")
def me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    session: Session = Depends(get_session),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Autenticación requerida")
    payload = _decode_or_401(credentials.credentials)
    user = session.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    org = session.get(Organization, user.organization_id) if user.organization_id else None
    result = user.dict(exclude={"password_hash"})
    result["organization_name"] = org.name if org else ""
    return result


@router.get("/status")
def status(session: Session = Depends(get_session)):
    """Public: check if system has been initialized (any users exist)."""
    user_count = len(session.exec(select(User)).all())
    return {"initialized": user_count > 0, "users": user_count}


@router.post("/setup")
def setup(session: Session = Depends(get_session)):
    """Public bootstrap — only works if NO users exist yet."""
    existing = session.exec(select(User)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sistema ya inicializado")

    from services.auth import hash_password

    org = session.exec(select(Organization)).first()
    if not org:
        org = Organization(
            name="ISM Consulting Services",
            plan="pro",
            retell_api_key=os.getenv("RETELL_API_KEY", ""),
            retell_phone_number=os.getenv("RETELL_PHONE_NUMBER", ""),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
        )
        session.add(org)
        session.commit()
        session.refresh(org)

    admin_email = os.getenv("SUPERADMIN_EMAIL", "admin@ismconsulting.com")
    admin_password = os.getenv("SUPERADMIN_PASSWORD", "ISMadmin2024!")
    admin = User(
        email=admin_email,
        password_hash=hash_password(admin_password),
        full_name="Super Admin",
        role="superadmin",
        organization_id=org.id,
    )
    session.add(admin)
    session.commit()
    logger.info("Bootstrap: superadmin created via /auth/setup")
    return {"ok": True, "email": "admin@ismconsulting.com"}
