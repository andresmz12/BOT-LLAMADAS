import csv
import io
import json
import logging
import os
import uuid
import asyncio
import base64 as _b64
from datetime import datetime
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session, select
from sqlalchemy import desc, func
from database import get_session
from models import User, Organization, WebhookLog, Prospect, Campaign, EmailSendLog, EmailEvent, EmailList, ScheduledEmailSend, EmailSequence, BulkEmailJob
from routes.auth import get_current_user, require_write_access, require_superadmin
from services.audit_log import log_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


SECRET_FIELDS = {"retell_api_key", "anthropic_api_key", "openai_api_key", "google_api_key"}
CREDENTIAL_FIELDS = {"retell_api_key", "retell_phone_number", "anthropic_api_key", "openai_api_key", "google_api_key"}


class CredentialsUpdate(BaseModel):
    retell_api_key: Optional[str] = None
    retell_phone_number: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    google_api_key: Optional[str] = None


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
    openai_key = ((org.openai_api_key if org else "") or "").strip()
    google_key = ((org.google_api_key if org else "") or "").strip()
    return {
        "retell_api_key": _mask(retell_key),
        "retell_phone_number": org.retell_phone_number if org else "",
        "anthropic_api_key": _mask(anthropic_key),
        "retell_api_key_configured": bool(retell_key),
        "anthropic_api_key_configured": bool(anthropic_key),
        "openai_api_key": _mask(openai_key),
        "openai_api_key_configured": bool(openai_key or os.getenv("OPENAI_API_KEY", "")),
        "google_api_key": _mask(google_key),
        "google_api_key_configured": bool(google_key or os.getenv("GOOGLE_API_KEY", "")),
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
            changed_fields = []
            for key, value in data.dict(exclude_unset=True).items():
                if value is None:
                    continue
                if key in SECRET_FIELDS and str(value).startswith("***"):
                    continue
                # Strip whitespace — pasted API keys often carry a trailing
                # newline, which makes the credential unusable as an auth header.
                setattr(org, key, str(value).strip())
                changed_fields.append(key)
            session.add(org)
            session.commit()
            if changed_fields:
                # Never log the actual secret values — only which fields changed.
                log_action(session, current_user, "settings.credentials_update", details=f"fields: {', '.join(changed_fields)}")
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


class EmailSettingsRequest(BaseModel):
    email_enabled: bool = False
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    email_send_on_interested: bool = True
    email_send_on_callback: bool = False
    email_send_on_voicemail: bool = False
    email_send_on_not_interested: bool = False
    email_templates: Optional[dict] = None
    email_send_delay_ms: int = 0


@router.get("/email")
def get_email_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    if not org:
        return {
            "email_enabled": False,
            "email_from": None,
            "email_from_name": None,
            "sendgrid_configured": False,
            "email_send_on_interested": True,
            "email_send_on_callback": False,
            "email_send_on_voicemail": False,
            "email_send_on_not_interested": False,
            "email_templates": {},
            "email_attachment_name": None,
        }
    sg_configured = bool((org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", ""))
    try:
        templates = json.loads(org.email_templates) if org.email_templates else {}
    except Exception:
        templates = {}
    return {
        "email_enabled": org.email_enabled,
        "email_from": org.email_from,
        "email_from_name": org.email_from_name,
        "sendgrid_configured": sg_configured,
        "email_send_on_interested": org.email_send_on_interested,
        "email_send_on_callback": org.email_send_on_callback,
        "email_send_on_voicemail": org.email_send_on_voicemail,
        "email_send_on_not_interested": org.email_send_on_not_interested,
        "email_templates": templates,
        "email_attachment_name": org.email_attachment_name,
        "email_send_delay_ms": org.email_send_delay_ms or 0,
    }


@router.post("/email")
def save_email_settings(
    data: EmailSettingsRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    org.email_enabled = data.email_enabled
    org.email_from = data.email_from or None
    org.email_from_name = data.email_from_name or None
    org.email_send_on_interested = data.email_send_on_interested
    org.email_send_on_callback = data.email_send_on_callback
    org.email_send_on_voicemail = data.email_send_on_voicemail
    org.email_send_on_not_interested = data.email_send_on_not_interested
    org.email_send_delay_ms = max(0, data.email_send_delay_ms)
    if data.email_templates is not None:
        # Preserve attachment_b64 stored in DB — it's never sent to the frontend
        existing_tmpls = {}
        if org.email_templates:
            try:
                existing_tmpls = json.loads(org.email_templates)
            except Exception:
                pass
        # Start from what's already saved instead of replacing the whole dict with
        # the payload: a stale/partial frontend snapshot (e.g. a tab that loaded
        # before another tab or session created a template) must not silently wipe
        # out templates it doesn't know about. Explicit deletion goes through
        # DELETE /email/template/{key} instead of "just don't send it back".
        merged = dict(existing_tmpls)
        for key, tmpl in data.email_templates.items():
            merged[key] = dict(tmpl)
            if key in existing_tmpls:
                for field in ("attachment_b64", "attachment_name"):
                    if field not in merged[key] and field in existing_tmpls[key]:
                        merged[key][field] = existing_tmpls[key][field]
        org.email_templates = json.dumps(merged)
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
