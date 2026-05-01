import json
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session, select
from sqlalchemy import desc
from database import get_session
from models import User, Organization, WebhookLog
from routes.auth import get_current_user, require_write_access, require_superadmin

router = APIRouter(prefix="/settings", tags=["settings"])

SECRET_FIELDS = {"retell_api_key", "anthropic_api_key"}
CREDENTIAL_FIELDS = {"retell_api_key", "retell_phone_number", "anthropic_api_key"}


class CredentialsUpdate(BaseModel):
    retell_api_key: Optional[str] = None
    retell_phone_number: Optional[str] = None
    anthropic_api_key: Optional[str] = None


def _mask(value: str) -> str:
    if not value:
        return ""
    return "***" + value[-4:] if len(value) > 4 else "****"


@router.get("")
def get_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    retell_key = org.retell_api_key if org else ""
    anthropic_key = org.anthropic_api_key if org else ""
    return {
        "retell_api_key": _mask(retell_key),
        "retell_phone_number": org.retell_phone_number if org else "",
        "anthropic_api_key": _mask(anthropic_key),
        "retell_api_key_configured": bool(retell_key),
        "anthropic_api_key_configured": bool(anthropic_key),
    }


@router.post("")
def save_settings(
    data: CredentialsUpdate,
    current_user: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    if current_user.organization_id:
        org = session.get(Organization, current_user.organization_id)
        if org:
            for key, value in data.dict(exclude_unset=True).items():
                if value is None:
                    continue
                if key in SECRET_FIELDS and str(value).startswith("***"):
                    continue
                setattr(org, key, str(value))
            session.add(org)
            session.commit()
    return {"ok": True}


@router.get("/crm")
def get_crm_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    if not org:
        return {
            "crm_type": None,
            "crm_webhook_url": None,
            "crm_webhook_enabled": False,
            "crm_events": [],
            "crm_webhook_secret_configured": False,
            "crm_api_key_configured": False,
            "crm_board_or_list_id": None,
        }
    try:
        events = json.loads(org.crm_events or "[]")
    except Exception:
        events = []
    return {
        "crm_type": org.crm_type,
        "crm_webhook_url": org.crm_webhook_url,
        "crm_webhook_enabled": org.crm_webhook_enabled,
        "crm_events": events,
        "crm_webhook_secret_configured": bool(org.crm_webhook_secret),
        "crm_api_key_configured": bool(org.crm_api_key),
        "crm_board_or_list_id": org.crm_board_or_list_id,
    }


@router.post("/crm/test")
async def test_crm_webhook(
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    if not org.crm_webhook_url:
        raise HTTPException(status_code=400, detail="No hay URL de webhook configurada")
    from services.crm_webhook import send_test_webhook
    result = await send_test_webhook(org, session)
    return result


class WhatsAppSettingsRequest(BaseModel):
    whatsapp_enabled: bool = False
    whatsapp_phone_number_id: str = ""
    whatsapp_access_token: str = ""
    whatsapp_verify_token: str = ""


@router.get("/whatsapp")
def get_whatsapp_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    base_url = os.getenv("BASE_URL", "").rstrip("/")
    return {
        "whatsapp_enabled": org.whatsapp_enabled if org else False,
        "whatsapp_phone_number_id": org.whatsapp_phone_number_id or "" if org else "",
        "whatsapp_access_token": _mask(org.whatsapp_access_token) if (org and org.whatsapp_access_token) else "",
        "whatsapp_verify_token": org.whatsapp_verify_token or "" if org else "",
        "webhook_url": f"{base_url}/webhook/whatsapp" if base_url else "/webhook/whatsapp",
    }


@router.post("/whatsapp")
def save_whatsapp_settings(
    data: WhatsAppSettingsRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    org.whatsapp_enabled = data.whatsapp_enabled
    org.whatsapp_phone_number_id = data.whatsapp_phone_number_id or None
    if data.whatsapp_access_token and not data.whatsapp_access_token.startswith("***"):
        org.whatsapp_access_token = data.whatsapp_access_token
    if data.whatsapp_verify_token:
        org.whatsapp_verify_token = data.whatsapp_verify_token
    session.add(org)
    session.commit()
    return {"ok": True}


@router.get("/crm/logs")
def get_crm_logs(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    logs = session.exec(
        select(WebhookLog)
        .where(WebhookLog.organization_id == current_user.organization_id)
        .order_by(desc(WebhookLog.created_at))
        .limit(10)
    ).all()
    return logs
