import os
import time
import logging
from collections import defaultdict
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlmodel import Session, select
from pydantic import BaseModel, field_validator
from database import get_session
from models import User, Organization
from services.auth import verify_password, create_token, decode_token

_login_attempts: dict[str, list[float]] = defaultdict(list)
_RATE_WINDOW = 60
_RATE_MAX = 5


def _get_client_ip(request: Request) -> str:
    """Use X-Real-IP (set by trusted reverse proxy) first, then fall back to direct IP.
    Never trust X-Forwarded-For alone — it can be forged by the client."""
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    # X-Forwarded-For: take the LAST entry (closest trusted proxy), not the first (client-supplied)
    forwarded_for = request.headers.get("x-forwarded-for", "").strip()
    if forwarded_for:
        return forwarded_for.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


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

    @field_validator("email")
    @classmethod
    def email_length(cls, v: str) -> str:
        if len(v) > 254:
            raise ValueError("Email demasiado largo")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_length(cls, v: str) -> str:
        if len(v) > 128:
            raise ValueError("Contraseña demasiado larga")
        return v


class RegisterRequest(BaseModel):
    full_name: str
    email: str
    password: str
    company_name: str

    @field_validator("email")
    @classmethod
    def email_length(cls, v: str) -> str:
        if len(v) > 254:
            raise ValueError("Email demasiado largo")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        if len(v) > 128:
            raise ValueError("Contraseña demasiado larga")
        return v

    @field_validator("full_name", "company_name")
    @classmethod
    def name_length(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError("Nombre demasiado largo")
        return v.strip()


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


def require_pro_plan(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> User:
    if current_user.role == "superadmin":
        return current_user
    org = session.get(Organization, current_user.organization_id)
    if org and org.plan == "free":
        raise HTTPException(
            status_code=403,
            detail="PLAN_FREE: Esta función requiere el plan Pro. Contacta soporte para activar."
        )
    return current_user


@router.post("/register")
def register(data: RegisterRequest, request: Request, session: Session = Depends(get_session)):
    _check_rate_limit(_get_client_ip(request))
    from services.auth import hash_password
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este email ya está registrado.")
    org = Organization(name=data.company_name, plan="free")
    session.add(org)
    session.commit()
    session.refresh(org)
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role="admin",
        organization_id=org.id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    token = create_token(user.id, user.role, user.organization_id)
    logger.info(f"Register: new org '{org.name}' user '{user.email}' (free plan)")
    return {"access_token": token, "token_type": "bearer"}


@router.post("/login")
def login(req: LoginRequest, request: Request, session: Session = Depends(get_session)):
    _check_rate_limit(_get_client_ip(request))
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
    result["plan"] = org.plan if org else "free"
    result["apify_enabled"] = org.apify_enabled if org else False
    return result


@router.get("/status")
def status(session: Session = Depends(get_session)):
    """Public: check if system has been initialized (any users exist)."""
    exists = session.exec(select(User)).first() is not None
    return {"initialized": exists}


class SetupRequest(BaseModel):
    setup_secret: str = ""


@router.post("/setup")
def setup(data: SetupRequest, session: Session = Depends(get_session)):
    """Public bootstrap — only works if NO users exist yet AND setup_secret matches."""
    setup_secret = os.getenv("SETUP_SECRET", "")
    if setup_secret and data.setup_secret != setup_secret:
        raise HTTPException(status_code=403, detail="Setup secret inválido")

    existing = session.exec(select(User)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Sistema ya inicializado")

    admin_email = os.getenv("SUPERADMIN_EMAIL", "")
    admin_password = os.getenv("SUPERADMIN_PASSWORD", "")
    if not admin_email or not admin_password:
        raise HTTPException(status_code=500, detail="SUPERADMIN_EMAIL y SUPERADMIN_PASSWORD deben estar configurados")

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

    admin = User(
        email=admin_email,
        password_hash=hash_password(admin_password),
        full_name="Super Admin",
        role="superadmin",
        organization_id=org.id,
    )
    session.add(admin)
    session.commit()
    logger.info(f"Bootstrap: superadmin created via /auth/setup for {admin_email}")
    return {"ok": True}
