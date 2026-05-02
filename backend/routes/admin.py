import json
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select, func
from sqlalchemy import desc
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import Organization, User, WebhookLog
from services.auth import hash_password
from routes.auth import require_superadmin

router = APIRouter(prefix="/admin", tags=["admin"])

_SENSITIVE = {"retell_api_key", "anthropic_api_key", "crm_api_key", "crm_webhook_secret", "whatsapp_access_token", "apify_api_token", "sendgrid_api_key"}

def _mask(key: str | None) -> str:
    if not key:
        return ""
    return f"{'*' * max(0, len(key) - 4)}{key[-4:]}" if len(key) > 4 else "****"

def _safe_org(org: Organization) -> dict:
    d = org.dict()
    for field in _SENSITIVE:
        if d.get(field):
            d[field] = _mask(d[field])
    d.setdefault("demo_calls_used", 0)
    return d


class OrgCreate(BaseModel):
    name: str
    logo_url: Optional[str] = None
    plan: str = "pro"
    retell_api_key: str = ""
    retell_phone_number: str = ""
    anthropic_api_key: str = ""
    is_active: bool = True
    crm_webhook_url: Optional[str] = None
    crm_webhook_enabled: bool = False
    crm_webhook_secret: Optional[str] = None
    crm_type: Optional[str] = None
    crm_events: str = '["call_ended","interested"]'
    crm_api_key: Optional[str] = None
    crm_board_or_list_id: Optional[str] = None
    crm_extra_config: Optional[str] = None
    whatsapp_enabled: bool = False
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    apify_enabled: bool = False
    apify_api_token: Optional[str] = None
    email_enabled: bool = False
    sendgrid_api_key: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "agent"
    organization_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    organization_id: Optional[int] = None
    is_active: Optional[bool] = None


@router.post("/organizations")
def create_org(
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = Organization(**data.dict())
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.get("/organizations")
def list_orgs(
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    return [_safe_org(org) for org in session.exec(select(Organization)).all()]


@router.put("/organizations/{org_id}")
def update_org(
    org_id: int,
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    for k, v in data.dict().items():
        # Never overwrite a real secret with a masked placeholder (e.g. "****xxxx")
        if k in _SENSITIVE and isinstance(v, str) and v.startswith("***"):
            continue
        setattr(org, k, v)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.post("/organizations/{org_id}/apify/test")
async def test_apify_token(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    import httpx
    import os
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    token = (org.apify_api_token or "").strip() or os.getenv("APIFY_API_TOKEN", "")
    if not token:
        return {"ok": False, "detail": "Token de Apify no configurado para esta organización"}
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            "https://api.apify.com/v2/users/me",
            headers={"Authorization": f"Bearer {token}"},
        )
    if resp.status_code == 200:
        username = resp.json().get("data", {}).get("username", "?")
        return {"ok": True, "username": username}
    error_msg = resp.json().get("error", {}).get("message", resp.text[:200]) if resp.headers.get("content-type", "").startswith("application/json") else resp.text[:200]
    return {"ok": False, "detail": error_msg}


@router.get("/organizations/{org_id}/secrets")
def get_org_secrets(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    return {
        "retell_api_key": org.retell_api_key or "",
        "anthropic_api_key": org.anthropic_api_key or "",
        "crm_api_key": org.crm_api_key or "",
        "crm_webhook_secret": org.crm_webhook_secret or "",
        "apify_api_token": org.apify_api_token or "",
        "sendgrid_api_key": org.sendgrid_api_key or "",
    }


@router.get("/organizations/{org_id}/crm-debug")
def debug_org_crm(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    """Raw-SQL diagnostic — safe even when ORM columns are missing from DB."""
    from sqlalchemy import text, inspect as sa_inspect
    from database import engine
    try:
        insp = sa_inspect(engine)
        cols = [c["name"] for c in insp.get_columns("organization")]
        safe_cols = [
            c for c in [
                "id", "name", "crm_type", "crm_webhook_enabled",
                "crm_webhook_url", "crm_board_or_list_id",
                "crm_events",
            ] if c in cols
        ]
        has_api_key_expr = "crm_api_key IS NOT NULL AND crm_api_key != '' AS has_crm_api_key" if "crm_api_key" in cols else "'?' AS has_crm_api_key"
        col_list = ", ".join(safe_cols) + ", " + has_api_key_expr
        row = session.execute(
            text(f"SELECT {col_list} FROM organization WHERE id = :id"),
            {"id": org_id},
        ).mappings().first()
        return {"db_columns": cols, "org": dict(row) if row else None}
    except Exception as e:
        return {"error": str(e)}


@router.post("/organizations/{org_id}/upgrade")
def upgrade_org(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    """Upgrade an organization from free to pro plan."""
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    org.plan = "pro"
    session.add(org)
    session.commit()
    return {"ok": True, "plan": org.plan}


@router.post("/organizations/{org_id}/crm/test")
async def test_org_crm_webhook(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    if not org.crm_webhook_url:
        raise HTTPException(status_code=400, detail="No hay URL de webhook configurada")
    from services.crm_webhook import send_test_webhook
    result = await send_test_webhook(org, session)
    return result


@router.get("/organizations/{org_id}/crm/logs")
def get_org_crm_logs(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    logs = session.exec(
        select(WebhookLog)
        .where(WebhookLog.organization_id == org_id)
        .order_by(desc(WebhookLog.created_at))
        .limit(20)
    ).all()
    return logs


@router.delete("/organizations/{org_id}")
def delete_org(
    org_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    from models import Campaign, Call, Prospect
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    user_count = session.exec(select(func.count(User.id)).where(User.organization_id == org_id)).one() or 0
    campaign_count = session.exec(select(func.count(Campaign.id)).where(Campaign.organization_id == org_id)).one() or 0
    if user_count or campaign_count:
        raise HTTPException(
            status_code=400,
            detail=f"La organización tiene {user_count} usuario(s) y {campaign_count} campaña(s). Elimínalos primero."
        )
    session.delete(org)
    session.commit()
    return {"ok": True}


@router.post("/users")
def create_user(
    data: UserCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya en uso")
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        organization_id=data.organization_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    result = user.dict(exclude={"password_hash"})
    org = session.get(Organization, user.organization_id) if user.organization_id else None
    result["organization_name"] = org.name if org else ""
    return result


@router.get("/users")
def list_users(
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User)).all()
    result = []
    for u in users:
        d = u.dict(exclude={"password_hash"})
        org = session.get(Organization, u.organization_id) if u.organization_id else None
        d["organization_name"] = org.name if org else ""
        result.append(d)
    return result


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(user, k, v)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.dict(exclude={"password_hash"})


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    session.delete(user)
    session.commit()
    return {"ok": True}
