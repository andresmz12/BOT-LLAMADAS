import csv
import io
import json
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

APP_BASE_URL = os.getenv("APP_BASE_URL", "").rstrip("/")


_UNSUB_SECRET = os.getenv("UNSUB_SECRET", "unsub-fallback-sign-key-change-me")


def _unsub_token(prospect_id: int, org_id: int) -> str:
    import hmac as _hmac, hashlib as _hashlib
    payload = f"{prospect_id}:{org_id}"
    sig = _hmac.new(_UNSUB_SECRET.encode(), payload.encode(), _hashlib.sha256).hexdigest()[:20]
    return _b64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def _verify_unsub_token(token: str):
    import hmac as _hmac, hashlib as _hashlib
    decoded = _b64.urlsafe_b64decode(token.encode()).decode()
    parts = decoded.rsplit(":", 1)
    if len(parts) != 2:
        raise ValueError("Bad token format")
    payload, sig = parts
    expected = _hmac.new(_UNSUB_SECRET.encode(), payload.encode(), _hashlib.sha256).hexdigest()[:20]
    if not _hmac.compare_digest(sig, expected):
        raise ValueError("Invalid signature")
    pid_str, oid_str = payload.split(":")
    return int(pid_str), int(oid_str)


def _unsub_url(prospect_id: int, org_id: int, base: str = "") -> str:
    effective = (APP_BASE_URL or base).rstrip("/")
    if not effective:
        return ""
    return f"{effective}/settings/email/unsubscribe?token={_unsub_token(prospect_id, org_id)}"

router = APIRouter(prefix="/settings", tags=["settings"])

_bulk_jobs_running: set = set()  # job_ids with a live in-process _run_bulk_send_job task
_last_send: dict = {}  # org_id -> timestamp of last bulk send (idempotency guard)

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
        merged = {}
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


@router.post("/email/attachment")
async def upload_email_attachment(
    file: UploadFile = File(...),
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 5 MB")
    org.email_attachment = contents
    org.email_attachment_name = file.filename
    session.add(org)
    session.commit()
    return {"ok": True, "filename": file.filename}


class EmailTestRequest(BaseModel):
    to_email: str
    outcome: str = "interested"
    template: Optional[dict] = None
    from_email_override: Optional[str] = None
    from_name_override: Optional[str] = None


@router.post("/email/test")
async def test_email(
    data: EmailTestRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="SendGrid no configurado. Pide al administrador que configure la API key.")

    class _FakeProspect:
        name = "Prospecto de Prueba"
        company = "Empresa Demo"
        phone = "+10000000000"
        email = data.to_email

    from services.sendgrid_service import _fill, _build_html, DEFAULT_SUBJECT
    import json as _json
    from datetime import datetime as _dt

    # Use inline template from frontend if provided, otherwise fall back to saved DB template
    if data.template is not None:
        tmpl = data.template
    else:
        templates = {}
        if org.email_templates:
            try:
                templates = _json.loads(org.email_templates)
            except Exception:
                pass
        tmpl = templates.get(data.outcome, {})

    tmpl_vars = {
        "nombre": "Prospecto de Prueba",
        "empresa": "Empresa Demo",
        "agente": data.from_name_override or org.email_from_name or "Isabella",
        "resumen": "Esta es una llamada de prueba para verificar el correo.",
        "telefono": "+10000000000",
        "fecha": _dt.utcnow().strftime("%d/%m/%Y"),
    }
    subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(data.outcome, "Email de prueba"), tmpl_vars)
    color     = tmpl.get("color") or "#4F46E5"
    greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
    body_text = _fill(tmpl.get("body") or "Este es un email de prueba enviado desde ZyraVoice.", tmpl_vars)
    cta_text  = tmpl.get("cta_text") or ""
    cta_url   = tmpl.get("cta_url") or ""
    signature = _fill(tmpl.get("signature") or f"El equipo de {tmpl_vars['agente']}", tmpl_vars)
    html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature)

    from_email = (data.from_email_override or org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
    from_name  = (data.from_name_override or org.email_from_name or "").strip() or "ZyraVoice"

    try:
        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition
        import base64 as _b64
        message = Mail(
            from_email=(from_email, from_name),
            to_emails=data.to_email,
            subject=f"[PRUEBA] {subject}",
            html_content=html_body,
        )
        # Per-template attachment takes priority over global attachment
        att_b64 = tmpl.get("attachment_b64") or ""
        att_name = tmpl.get("attachment_name") or ""
        if not att_b64 and org.email_attachment and org.email_attachment_name:
            att_b64 = _b64.b64encode(org.email_attachment).decode()
            att_name = org.email_attachment_name
        if att_b64 and att_name:
            ext = att_name.rsplit(".", 1)[-1].lower()
            mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
            message.attachment = Attachment(
                FileContent(att_b64),
                FileName(att_name),
                FileType(mime),
                Disposition("attachment"),
            )
        sg = SendGridAPIClient(api_key)
        resp = sg.send(message)
        return {"ok": True, "status_code": resp.status_code}
    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).error(f"Test email failed: {e}", exc_info=True)
        err_str = str(e)
        if "401" in err_str or "Unauthorized" in err_str:
            detail = "SendGrid rechazó la API key (401 Unauthorized). Ve a SendGrid → Settings → API Keys y verifica que la key sea válida y tenga permiso 'Mail Send'. Luego actualízala en el Admin Panel."
        elif "403" in err_str or "Forbidden" in err_str:
            detail = "SendGrid rechazó el remitente (403 Forbidden). Verifica que el email remitente esté verificado en SendGrid (Sender Authentication)."
        elif "from" in err_str.lower() or "sender" in err_str.lower():
            detail = "Email remitente inválido o no verificado en SendGrid. Configura un remitente verificado."
        else:
            detail = f"Error al enviar el correo de prueba: {err_str[:200]}"
        raise HTTPException(status_code=400, detail=detail)


class BulkEmailRequest(BaseModel):
    campaign_id: Optional[int] = None
    template_key: str = "general"
    email_only: bool = False
    email_list_id: Optional[int] = None
    batch_size: Optional[int] = None
    scheduled_at: Optional[str] = None  # ISO datetime string; if set and in the future, store job
    skip_labeled: bool = True  # skip contacts already classified (interested/not_interested/converted/do_not_contact)


@router.post("/email/bulk-send")
async def bulk_send_email(
    request: Request,
    data: BulkEmailRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="SendGrid no configurado. Pide al administrador que configure la API key.")

    # Idempotency guard: reject duplicate requests within 15 seconds for same org+template+target
    import time as _time
    _send_key = (current_user.organization_id, data.template_key, data.campaign_id, data.email_list_id, data.email_only)
    _now = _time.monotonic()
    if _send_key in _last_send and _now - _last_send[_send_key] < 15:
        raise HTTPException(status_code=429, detail="Envío duplicado detectado. Espera unos segundos antes de intentar de nuevo.")
    _last_send[_send_key] = _now

    # If scheduled for the future, store the job and return early
    if data.scheduled_at:
        try:
            scheduled_dt = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00"))
            # Convert to naive UTC for comparison with utcnow()
            if scheduled_dt.tzinfo is not None:
                from datetime import timezone
                scheduled_dt = scheduled_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha inválido")
        if scheduled_dt > datetime.utcnow():
            job = ScheduledEmailSend(
                organization_id=current_user.organization_id,
                campaign_id=data.campaign_id,
                email_list_id=data.email_list_id,
                template_key=data.template_key,
                email_only=data.email_only,
                scheduled_at=scheduled_dt,
                initiated_by=current_user.email,
            )
            session.add(job)
            session.commit()
            session.refresh(job)
            return {"scheduled": True, "job_id": job.id, "scheduled_at": job.scheduled_at.isoformat()}

    # Load prospects — skip unsubscribed
    from sqlalchemy import nulls_first
    query = select(Prospect).where(
        Prospect.organization_id == current_user.organization_id,
        Prospect.email.is_not(None),
        Prospect.email != "",
        Prospect.email_unsubscribed == False,  # noqa: E712
    )
    if data.email_list_id:
        query = query.where(Prospect.email_list_id == data.email_list_id)
    elif data.email_only:
        query = query.where(Prospect.campaign_id == None)  # noqa: E711
    elif data.campaign_id:
        query = query.where(Prospect.campaign_id == data.campaign_id)
    if data.skip_labeled:
        query = query.where(Prospect.email_label.is_(None))
    query = query.order_by(nulls_first(Prospect.last_email_sent_at.asc()))
    all_prospects = session.exec(query).all()

    # Deduplicate by email
    seen_bulk: set[str] = set()
    deduped: list = []
    for p in all_prospects:
        key = (p.email or "").strip().lower()
        if key and key not in seen_bulk:
            seen_bulk.add(key)
            deduped.append(p)
    all_prospects = deduped
    if not all_prospects:
        raise HTTPException(status_code=400, detail="No hay prospectos con email válido en esta selección")
    prospects_slice = all_prospects[:data.batch_size] if data.batch_size and data.batch_size > 0 else all_prospects

    from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
    from_name  = (org.email_from_name or "").strip() or "ZyraVoice"
    delay_s    = (org.email_send_delay_ms or 0) / 1000.0

    # Snapshot prospects as plain dicts so the background task doesn't need the session
    prospects_data = [
        {"id": p.id, "email": p.email or "", "name": p.name or "",
         "company": p.company or "", "phone": p.phone or ""}
        for p in prospects_slice
    ]

    job_row = BulkEmailJob(
        organization_id=current_user.organization_id,
        status="running",
        template_key=data.template_key,
        from_email=from_email,
        from_name=from_name,
        delay_ms=org.email_send_delay_ms or 0,
        campaign_id=data.campaign_id,
        email_only=data.email_only or False,
        email_list_id=data.email_list_id,
        batch_size=data.batch_size,
        base_url=str(request.base_url).rstrip("/"),
        initiated_by=current_user.email,
        total=len(prospects_data),
        remaining=json.dumps(prospects_data),
    )
    session.add(job_row)
    session.commit()
    session.refresh(job_row)
    job_id = str(job_row.id)

    background_tasks.add_task(_run_bulk_send_job, job_id=job_id, api_key=api_key)

    return {"job_id": job_id, "status": "running", "total": len(prospects_data)}


async def _run_bulk_send_job(job_id: str, api_key: str):
    _bulk_jobs_running.add(job_id)
    try:
        await _run_bulk_send_job_inner(job_id, api_key)
    finally:
        _bulk_jobs_running.discard(job_id)


async def _run_bulk_send_job_inner(job_id: str, api_key: str):
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition, CustomArg
    from services.sendgrid_service import _fill, _build_html, DEFAULT_SUBJECT
    from database import engine as _engine

    with Session(_engine) as s0:
        row = s0.get(BulkEmailJob, int(job_id))
        if not row:
            return
        org_id = row.organization_id
        user_email = row.initiated_by
        from_email = row.from_email
        from_name = row.from_name
        delay_s = (row.delay_ms or 0) / 1000.0
        template_key = row.template_key
        campaign_id = row.campaign_id
        email_only = row.email_only
        email_list_id = row.email_list_id
        batch_size = row.batch_size
        base_url = row.base_url
        prospects_data = json.loads(row.remaining or "[]")
        sent_list = json.loads(row.sent_list or "[]")
        failed_list = json.loads(row.failed_list or "[]")
        sent_count = row.sent
        skipped_count = row.skipped

    sg = SendGridAPIClient(api_key)
    tmpl: dict = {}

    while prospects_data:
        # Pausable: wait here while the job is paused before sending the next email
        while True:
            with Session(_engine) as s_chk:
                row = s_chk.get(BulkEmailJob, int(job_id))
                if not row or row.status in ("cancelled", "done"):
                    return
                if row.status != "paused":
                    break
            await asyncio.sleep(1)

        pdata = prospects_data[0]
        try:
            # Re-read the template/attachment from the DB on every send, so changes made
            # mid-job (e.g. while paused) take effect for the remaining prospects instead
            # of the stale snapshot captured when the job started.
            with Session(_engine) as s_tmpl:
                org_fresh = s_tmpl.get(Organization, org_id)
                templates_fresh = {}
                if org_fresh and org_fresh.email_templates:
                    try:
                        templates_fresh = json.loads(org_fresh.email_templates)
                    except Exception:
                        pass
                tmpl = templates_fresh.get(template_key, {})
                att_b64 = tmpl.get("attachment_b64") or ""
                att_name = tmpl.get("attachment_name") or ""
                if not att_b64 and org_fresh and org_fresh.email_attachment and org_fresh.email_attachment_name:
                    att_b64 = _b64.b64encode(org_fresh.email_attachment).decode()
                    att_name = org_fresh.email_attachment_name

            unsub = _unsub_url(pdata["id"], org_id, base=base_url)
            tmpl_vars = {
                "nombre":   pdata["name"],
                "empresa":  pdata["company"],
                "agente":   from_name,
                "resumen":  "",
                "telefono": pdata["phone"],
                "fecha":    datetime.utcnow().strftime("%d/%m/%Y"),
            }
            subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(template_key, "Mensaje"), tmpl_vars)
            color     = tmpl.get("color") or "#4F46E5"
            greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
            body_text = _fill(tmpl.get("body") or "", tmpl_vars)
            cta_text  = tmpl.get("cta_text") or ""
            cta_url   = tmpl.get("cta_url") or ""
            signature = _fill(tmpl.get("signature") or f"El equipo de {from_name}", tmpl_vars)
            html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature, unsubscribe_url=unsub)

            message = Mail(
                from_email=(from_email, from_name),
                to_emails=pdata["email"],
                subject=subject,
                html_content=html_body,
            )
            message.custom_arg = [
                CustomArg(key="org_id", value=str(org_id)),
                CustomArg(key="template_key", value=template_key),
            ]
            if att_b64 and att_name:
                ext = att_name.rsplit(".", 1)[-1].lower()
                mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
                message.attachment = Attachment(
                    FileContent(att_b64), FileName(att_name), FileType(mime), Disposition("attachment"),
                )

            # Run sync SDK call in thread pool so event loop stays unblocked
            await asyncio.to_thread(sg.send, message)

            # Update prospect stats in own session
            with Session(_engine) as s:
                p = s.get(Prospect, pdata["id"])
                if p:
                    p.last_email_sent_at = datetime.utcnow()
                    p.email_send_count = (p.email_send_count or 0) + 1
                    s.add(p)
                    s.commit()

            sent_count += 1
            sent_list.append({"name": pdata["name"], "email": pdata["email"]})

        except Exception as e:
            failed_list.append({"email": pdata["email"], "error": str(e)[:80]})
            skipped_count += 1

        # Remove processed prospect and persist progress so a restart can resume exactly here
        prospects_data.pop(0)
        with Session(_engine) as s_upd:
            row = s_upd.get(BulkEmailJob, int(job_id))
            if not row or row.status == "cancelled":
                return
            row.remaining = json.dumps(prospects_data)
            row.sent = sent_count
            row.skipped = skipped_count
            row.sent_list = json.dumps(sent_list)
            row.failed_list = json.dumps(failed_list)
            row.updated_at = datetime.utcnow()
            s_upd.add(row)
            s_upd.commit()

        if delay_s > 0:
            await asyncio.sleep(delay_s)

    # Resolve campaign name for log
    if email_only:
        camp_name = "Contactos de email"
    elif campaign_id:
        from database import engine as _eng2
        with Session(_eng2) as s:
            c = s.get(Campaign, campaign_id)
            camp_name = c.name if c else None
    else:
        camp_name = None

    with Session(_engine) as s:
        log_entry = EmailSendLog(
            organization_id=org_id,
            template_key=template_key,
            template_subject=tmpl.get("subject") or "",
            campaign_id=campaign_id,
            campaign_name=camp_name,
            total_sent=sent_count,
            total_skipped=skipped_count,
            total_errors=len(failed_list),
            error_details=json.dumps(failed_list) if failed_list else None,
            initiated_by=user_email,
            source_email_only=email_only or False,
            source_email_list_id=email_list_id,
            source_batch_size=batch_size,
            sent_details=json.dumps(sent_list) if sent_list else None,
        )
        s.add(log_entry)
        row = s.get(BulkEmailJob, int(job_id))
        if row:
            row.status = "done"
            row.updated_at = datetime.utcnow()
            s.add(row)
        s.commit()


def _job_to_dict(row: "BulkEmailJob") -> dict:
    return {
        "org_id": row.organization_id,
        "status": row.status,
        "paused": row.status == "paused",
        "sent": row.sent,
        "skipped": row.skipped,
        "total": row.total,
        "sent_list": json.loads(row.sent_list or "[]"),
        "failed_list": json.loads(row.failed_list or "[]"),
    }


@router.get("/email/bulk-send/status/{job_id}")
def bulk_send_status(job_id: str, current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    row = session.get(BulkEmailJob, int(job_id))
    if not row:
        raise HTTPException(status_code=404, detail="Job no encontrado o expirado")
    if current_user.role != "superadmin" and row.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return {**_job_to_dict(row), "job_id": job_id}


@router.get("/email/bulk-send/active")
def get_active_bulk_send(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    """Find the most recently created running/paused job for this org — lets the
    frontend reattach to an in-progress send after a page refresh OR a backend restart,
    since job state now lives in the DB instead of in-process memory."""
    if not current_user.organization_id:
        return {"job_id": None}
    row = session.exec(
        select(BulkEmailJob)
        .where(
            BulkEmailJob.organization_id == current_user.organization_id,
            BulkEmailJob.status.in_(["running", "paused"]),
        )
        .order_by(BulkEmailJob.id.desc())
    ).first()
    if not row:
        return {"job_id": None}
    return {**_job_to_dict(row), "job_id": str(row.id)}


@router.post("/email/bulk-send/{job_id}/pause")
def pause_bulk_send(job_id: str, current_user: User = Depends(require_write_access), session: Session = Depends(get_session)):
    row = session.get(BulkEmailJob, int(job_id))
    if not row:
        raise HTTPException(status_code=404, detail="Job no encontrado o expirado")
    if current_user.role != "superadmin" and row.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if row.status == "running":
        row.status = "paused"
        row.updated_at = datetime.utcnow()
        session.add(row)
        session.commit()
    return {**_job_to_dict(row), "job_id": job_id}


@router.post("/email/bulk-send/{job_id}/resume")
def resume_bulk_send(job_id: str, current_user: User = Depends(require_write_access), session: Session = Depends(get_session)):
    row = session.get(BulkEmailJob, int(job_id))
    if not row:
        raise HTTPException(status_code=404, detail="Job no encontrado o expirado")
    if current_user.role != "superadmin" and row.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if row.status == "paused":
        row.status = "running"
        row.updated_at = datetime.utcnow()
        session.add(row)
        session.commit()
        # If no live task is currently processing this job (e.g. it was left
        # paused across a backend restart), relaunch it; otherwise the
        # already-running task's pause-wait loop will pick up the new status itself.
        if job_id not in _bulk_jobs_running:
            org = session.get(Organization, row.organization_id)
            api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "") if org else ""
            if api_key:
                asyncio.create_task(_run_bulk_send_job(job_id=job_id, api_key=api_key))
    return {**_job_to_dict(row), "job_id": job_id}


@router.get("/email/history")
def get_email_history(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    logs = session.exec(
        select(EmailSendLog)
        .where(EmailSendLog.organization_id == current_user.organization_id)
        .order_by(desc(EmailSendLog.sent_at))
        .limit(50)
    ).all()
    return [
        {
            "id": l.id,
            "sent_at": l.sent_at.isoformat(),
            "template_key": l.template_key,
            "template_subject": l.template_subject,
            "campaign_name": l.campaign_name,
            "campaign_id": l.campaign_id,
            "total_sent": l.total_sent,
            "total_skipped": l.total_skipped,
            "total_errors": l.total_errors,
            "initiated_by": l.initiated_by,
            "source_email_only": l.source_email_only or False,
            "source_email_list_id": l.source_email_list_id,
            "source_batch_size": l.source_batch_size,
            "sent_details": json.loads(l.sent_details) if l.sent_details else [],
            "error_details": json.loads(l.error_details) if l.error_details else [],
        }
        for l in logs
    ]


@router.patch("/email/contacts/{prospect_id}/unsubscribe")
def toggle_contact_unsubscribe(
    prospect_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    prospect = session.get(Prospect, prospect_id)
    if not prospect or (current_user.role != "superadmin" and prospect.organization_id != current_user.organization_id):
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    prospect.email_unsubscribed = not prospect.email_unsubscribed
    session.add(prospect)
    session.commit()
    return {"email_unsubscribed": prospect.email_unsubscribed}


@router.post("/email/contacts/{prospect_id}/block")
def block_contact_email(
    prospect_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Mark email as permanently blocked and remove from any list, without deleting the record.
    This ensures the email can never be re-imported and accidentally receive emails again."""
    prospect = session.get(Prospect, prospect_id)
    if not prospect or (current_user.role != "superadmin" and prospect.organization_id != current_user.organization_id):
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    prospect.email_unsubscribed = True
    prospect.email_list_id = None   # detach from list so it won't appear in list views
    prospect.campaign_id = None
    session.add(prospect)
    session.commit()
    return {"ok": True, "email_unsubscribed": True}


class LabelContactRequest(BaseModel):
    label: Optional[str] = None  # interested / not_interested / converted / do_not_contact / None (clear)
    move_to_list_id: Optional[int] = None   # move to a different email list
    unsubscribe: Optional[bool] = None      # also mark as unsubscribed (default: True when do_not_contact)


@router.patch("/email/contacts/{prospect_id}/label")
def label_contact(
    prospect_id: int,
    data: LabelContactRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Classify a contact (interested/not_interested/converted/do_not_contact) and optionally move to another list."""
    VALID_LABELS = {None, "interested", "not_interested", "converted", "do_not_contact"}
    if data.label not in VALID_LABELS:
        raise HTTPException(status_code=400, detail=f"Label inválido. Opciones: {', '.join(str(l) for l in VALID_LABELS if l)}")
    prospect = session.get(Prospect, prospect_id)
    if not prospect or (current_user.role != "superadmin" and prospect.organization_id != current_user.organization_id):
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    prospect.email_label = data.label
    if data.move_to_list_id is not None:
        prospect.email_list_id = data.move_to_list_id if data.move_to_list_id > 0 else None
    if data.unsubscribe is not None:
        prospect.email_unsubscribed = data.unsubscribe
    elif data.label == "do_not_contact":
        prospect.email_unsubscribed = True
    session.add(prospect)
    session.commit()
    return {
        "id": prospect.id,
        "email_label": prospect.email_label,
        "email_unsubscribed": prospect.email_unsubscribed,
        "email_list_id": prospect.email_list_id,
    }


@router.get("/email/validate-recipients")
def validate_email_recipients(
    campaign_id: Optional[int] = None,
    email_only: bool = False,
    email_list_id: Optional[int] = None,
    batch_size: Optional[int] = None,
    skip_labeled: bool = True,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return {"total": 0, "with_email": 0, "without_email": 0, "unsubscribed": 0, "will_receive": 0}

    base = select(Prospect).where(Prospect.organization_id == current_user.organization_id)
    if email_list_id:
        base = base.where(Prospect.email_list_id == email_list_id)
    elif email_only:
        base = base.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
        base = base.where(Prospect.campaign_id == campaign_id)
    all_prospects = session.exec(base).all()

    # Deduplicate by email — same address counts as one recipient
    seen_emails: set[str] = set()
    unique_prospects = []
    no_email_count = 0
    for p in all_prospects:
        email = (p.email or "").strip().lower()
        if not email:
            no_email_count += 1
            continue
        if email not in seen_emails:
            seen_emails.add(email)
            unique_prospects.append(p)

    total = len(unique_prospects) + no_email_count
    with_email = len(unique_prospects)
    without_email = no_email_count
    unsubscribed = sum(1 for p in unique_prospects if p.email_unsubscribed)
    labeled = sum(1 for p in unique_prospects if not p.email_unsubscribed and p.email_label and skip_labeled)
    will_receive = with_email - unsubscribed - labeled

    # Batch info: how many would be sent in this run vs total available
    will_receive_this_batch = min(will_receive, batch_size) if batch_size and batch_size > 0 else will_receive

    return {
        "total": total,
        "with_email": with_email,
        "without_email": without_email,
        "unsubscribed": unsubscribed,
        "labeled": labeled,
        "will_receive": will_receive,
        "will_receive_this_batch": will_receive_this_batch,
        "batch_size": batch_size,
    }


@router.get("/email/recipients-detail")
def email_recipients_detail(
    campaign_id: Optional[int] = None,
    email_list_id: Optional[int] = None,
    email_only: bool = False,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return {"will_receive": [], "skipped": []}

    base = select(Prospect).where(Prospect.organization_id == current_user.organization_id)
    if email_list_id:
        base = base.where(Prospect.email_list_id == email_list_id)
    elif email_only:
        base = base.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
        base = base.where(Prospect.campaign_id == campaign_id)
    prospects = session.exec(base).all()

    # Build a map of campaign_id → campaign name for display
    from models import Campaign
    campaign_ids = {p.campaign_id for p in prospects if p.campaign_id}
    campaigns_map: dict[int, str] = {}
    for cid in campaign_ids:
        c = session.get(Campaign, cid)
        if c:
            campaigns_map[cid] = c.name

    will_receive = []
    skipped = []
    for p in prospects:
        campaign_name = campaigns_map.get(p.campaign_id, "") if p.campaign_id else ""
        entry = {
            "id": p.id,
            "name": p.name or "",
            "email": p.email or "",
            "phone": p.phone or "",
            "campaign": campaign_name,
        }
        if not (p.email or "").strip():
            skipped.append({**entry, "reason": "Sin email"})
        elif p.email_unsubscribed:
            skipped.append({**entry, "reason": "Desuscrito"})
        else:
            will_receive.append(entry)

    return {"will_receive": will_receive, "skipped": skipped}


@router.get("/email/unsubscribe", response_class=HTMLResponse)
def email_unsubscribe(
    token: str = "",
    session: Session = Depends(get_session),
):
    import html as _html
    try:
        prospect_id, org_id = _verify_unsub_token(token)
        prospect = session.get(Prospect, prospect_id)
        if prospect and prospect.organization_id == org_id:
            prospect.email_unsubscribed = True
            # If contact belongs to an email list, remove them from it entirely
            if prospect.email_list_id is not None:
                session.delete(prospect)
            else:
                session.add(prospect)
            session.commit()
            name = _html.escape(prospect.name or "Estimado/a")
            return HTMLResponse(f"""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Suscripción cancelada</title>
<style>body{{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}}
.box{{text-align:center;padding:40px;max-width:400px}}
h1{{color:#111827;font-size:22px;margin-bottom:8px}}p{{color:#6b7280;font-size:14px}}</style></head>
<body><div class="box"><h1>✓ Suscripción cancelada</h1>
<p>{name}, has sido eliminado de nuestra lista de correos.<br>No recibirás más emails de nuestra parte.</p></div></body></html>""")
    except Exception:
        pass
    return HTMLResponse("""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Error</title>
<style>body{{font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb}}
.box{{text-align:center;padding:40px}}</style></head>
<body><div class="box"><h1 style="color:#dc2626">Enlace no válido</h1><p style="color:#6b7280">Este enlace ya no es válido o ha expirado.</p></div></body></html>""")


@router.post("/email/template-attachment")
async def upload_template_attachment(
    template_key: str = Form(...),
    file: UploadFile = File(...),
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 5 MB")

    templates = {}
    if org.email_templates:
        try:
            templates = json.loads(org.email_templates)
        except Exception:
            pass
    tmpl = templates.get(template_key, {})
    tmpl["attachment_b64"] = _b64.b64encode(contents).decode()
    tmpl["attachment_name"] = file.filename
    templates[template_key] = tmpl
    org.email_templates = json.dumps(templates)
    session.add(org)
    session.commit()
    return {"ok": True, "filename": file.filename, "template_key": template_key}


@router.delete("/email/template-attachment/{template_key}")
async def delete_template_attachment(
    template_key: str,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Removes this template's own attachment so sends fall back to the
    organization's global attachment (configured in Configuración automática)."""
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    templates = {}
    if org.email_templates:
        try:
            templates = json.loads(org.email_templates)
        except Exception:
            pass
    tmpl = templates.get(template_key, {})
    tmpl.pop("attachment_b64", None)
    tmpl.pop("attachment_name", None)
    templates[template_key] = tmpl
    org.email_templates = json.dumps(templates)
    session.add(org)
    session.commit()
    return {"ok": True}


@router.get("/email/email-contacts-count")
def get_email_contacts_count(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return {"total": 0, "with_email": 0}
    all_q = session.exec(
        select(Prospect).where(
            Prospect.organization_id == current_user.organization_id,
            Prospect.campaign_id == None,  # noqa: E711
        )
    ).all()
    total = len(all_q)
    with_email = sum(1 for p in all_q if (p.email or "").strip() and not p.email_unsubscribed)
    return {"total": total, "with_email": with_email}


@router.post("/email/import-contacts")
async def import_email_contacts(
    file: UploadFile = File(...),
    email_list_id: Optional[int] = Form(None),
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    if email_list_id:
        el = session.get(EmailList, email_list_id)
        if not el or el.organization_id != current_user.organization_id:
            raise HTTPException(status_code=404, detail="Lista de email no encontrada")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Archivo demasiado grande (máx. 10 MB)")

    filename = (file.filename or "").lower()

    def _find(row, *keys):
        for k in keys:
            for rk in row:
                if rk.strip().lower() == k:
                    return (row[rk] or "").strip()
        return ""

    def _parse_xlsx(data: bytes) -> list:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(data), read_only=True, data_only=True)
        ws = wb.active
        result = []
        headers = None
        for excel_row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip().lower() if c is not None else "" for c in excel_row]
            else:
                row_dict = {
                    headers[j]: (str(v).strip() if v is not None else "")
                    for j, v in enumerate(excel_row) if j < len(headers)
                }
                if any(val for val in row_dict.values()):
                    result.append(row_dict)
        return result

    def _parse_csv(data: bytes) -> list:
        for enc in ("utf-8-sig", "utf-8", "latin-1"):
            try:
                text = data.decode(enc)
                reader_obj = csv.DictReader(io.StringIO(text))
                rows_out = [{k.strip().lower(): (v or "").strip() for k, v in r.items()} for r in reader_obj]
                if rows_out:
                    return rows_out
            except Exception:
                continue
        return []

    # Parse rows from CSV or Excel — try by extension first, then fallback
    rows = []
    is_excel = filename.endswith(".xlsx") or filename.endswith(".xls")
    try:
        import openpyxl as _opxl_check  # noqa: check availability
        openpyxl_available = True
    except ImportError:
        openpyxl_available = False

    if is_excel and openpyxl_available:
        try:
            rows = _parse_xlsx(contents)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Error leyendo Excel: {exc}")
    elif is_excel and not openpyxl_available:
        raise HTTPException(status_code=400, detail="El servidor no soporta .xlsx. Sube el archivo como CSV.")
    else:
        rows = _parse_csv(contents)
        # If CSV parsing yielded nothing, try openpyxl as fallback (file may be xlsx renamed)
        if not rows and openpyxl_available:
            try:
                rows = _parse_xlsx(contents)
            except Exception:
                pass

    # Emails blocked org-wide (unsubscribed) — never import these regardless of list
    blocked_emails: set[str] = {
        (p.email or "").lower()
        for p in session.exec(
            select(Prospect).where(
                Prospect.organization_id == current_user.organization_id,
                Prospect.email_unsubscribed == True,  # noqa: E712
            )
        ).all()
        if p.email
    }

    # Fetch existing emails to deduplicate — scope to the list if one is specified,
    # otherwise check org-wide to avoid cross-campaign duplicates.
    if email_list_id:
        existing = {
            (p.email or "").lower()
            for p in session.exec(
                select(Prospect).where(Prospect.email_list_id == email_list_id)
            ).all()
            if p.email
        }
    else:
        existing = {
            (p.email or "").lower()
            for p in session.exec(
                select(Prospect).where(Prospect.organization_id == current_user.organization_id)
            ).all()
            if p.email
        }
    existing |= blocked_emails  # always skip blocked emails

    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows, start=2):
        raw_email_field = _find(row, "email", "correo", "e-mail", "mail", "email address", "correo electronico", "correo electrónico", "e mail")
        # Split by semicolons to handle multiple emails per cell
        email_candidates = [e.strip() for e in raw_email_field.replace(",", ";").split(";") if e.strip()]

        if not email_candidates:
            errors.append(f"Fila {i}: email vacío")
            skipped += 1
            continue

        name = _find(row, "nombre", "name", "contacto")
        company = _find(row, "empresa", "company", "compañia", "compania", "negocio")

        row_imported = 0
        for email in email_candidates:
            if "@" not in email:
                errors.append(f"Fila {i}: email inválido '{email}'")
                skipped += 1
                continue
            if email.lower() in existing:
                skipped += 1
                continue

            prospect_name = name or email.split("@")[0]
            prospect = Prospect(
                campaign_id=None,
                email_list_id=email_list_id,
                organization_id=current_user.organization_id,
                name=prospect_name,
                phone=None,
                email=email,
                company=company or None,
                status="email_only",
            )
            session.add(prospect)
            existing.add(email.lower())
            row_imported += 1

        imported += row_imported

    session.commit()
    return {"imported": imported, "skipped": skipped, "errors": errors[:10]}


# ── Email Lists ────────────────────────────────────────────────────────────────

class EmailListCreate(BaseModel):
    name: str


@router.get("/email/lists")
def get_email_lists(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    lists = session.exec(
        select(EmailList)
        .where(EmailList.organization_id == current_user.organization_id)
        .order_by(EmailList.created_at)
    ).all()
    result = []
    for el in lists:
        total = session.exec(
            select(func.count(Prospect.id)).where(Prospect.email_list_id == el.id)
        ).one()
        with_email = session.exec(
            select(func.count(Prospect.id)).where(
                Prospect.email_list_id == el.id,
                Prospect.email.is_not(None),
                Prospect.email != "",
                Prospect.email_unsubscribed == False,  # noqa: E712
            )
        ).one()
        result.append({
            "id": el.id, "name": el.name,
            "total": total, "with_email": with_email,
            "created_at": el.created_at.isoformat() if el.created_at else None,
        })
    return result


@router.post("/email/lists")
def create_email_list(
    data: EmailListCreate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    el = EmailList(name=data.name.strip(), organization_id=current_user.organization_id)
    session.add(el)
    session.commit()
    session.refresh(el)
    return {"id": el.id, "name": el.name, "total": 0, "with_email": 0, "created_at": el.created_at.isoformat() if el.created_at else None}


@router.delete("/email/lists/{list_id}")
def delete_email_list(
    list_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    el = session.get(EmailList, list_id)
    if not el or el.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404)
    prospects = session.exec(select(Prospect).where(Prospect.email_list_id == list_id)).all()
    for p in prospects:
        session.delete(p)
    session.delete(el)
    session.commit()
    return {"ok": True}


@router.get("/email/lists/{list_id}/contacts")
def get_email_list_contacts(
    list_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    el = session.get(EmailList, list_id)
    if not el or el.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404)
    prospects = session.exec(
        select(Prospect)
        .where(Prospect.email_list_id == list_id)
        .order_by(Prospect.id.desc())
    ).all()
    return [
        {
            "id": p.id, "name": p.name, "email": p.email,
            "company": p.company, "unsubscribed": p.email_unsubscribed,
            "email_label": p.email_label,
        }
        for p in prospects
    ]


class EmailListContactCreate(BaseModel):
    name: str
    email: str
    company: Optional[str] = None


@router.post("/email/lists/{list_id}/contacts")
def add_email_list_contact(
    list_id: int,
    data: EmailListContactCreate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    el = session.get(EmailList, list_id)
    if not el or el.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404)
    email = (data.email or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Email inválido")
    existing = session.exec(
        select(Prospect).where(Prospect.email_list_id == list_id, Prospect.email == email)
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este email ya está en la lista")
    p = Prospect(
        campaign_id=None, email_list_id=list_id,
        organization_id=current_user.organization_id,
        name=data.name.strip() or email.split("@")[0],
        phone=None, email=email, company=data.company or None, status="email_only",
    )
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"id": p.id, "name": p.name, "email": p.email, "company": p.company, "unsubscribed": False}


@router.delete("/email/lists/{list_id}/contacts/{contact_id}")
def delete_email_list_contact(
    list_id: int,
    contact_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    p = session.get(Prospect, contact_id)
    if not p or p.organization_id != current_user.organization_id or p.email_list_id != list_id:
        raise HTTPException(status_code=404)
    session.delete(p)
    session.commit()
    return {"ok": True}


# ── Email sequences (drip campaigns) ────────────────────────────────────────────

class SequenceGenerateRequest(BaseModel):
    email_list_id: int
    objective: str
    tone: str = "Profesional"
    language: str = "Español"
    dates: list[str]  # ISO date strings, one per email


@router.post("/email/sequences/generate")
async def generate_email_sequence(
    data: SequenceGenerateRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    api_key = ((org.anthropic_api_key if org else "") or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada.")
    if not data.dates:
        raise HTTPException(status_code=400, detail="Debes indicar al menos una fecha")

    lang_hint = {
        "Español": "Escribe en español.",
        "Inglés": "Write in English.",
        "Spanglish": "Mix Spanish and English naturally, as spoken by US Latinos.",
    }.get(data.language, "Escribe en español.")

    n = len(data.dates)
    def _date_only(iso_str: str) -> str:
        try:
            return datetime.fromisoformat(iso_str.replace("Z", "+00:00")).strftime("%d/%m/%Y")
        except Exception:
            return iso_str[:10]

    dates_list = "\n".join(f"{i+1}. {_date_only(d)}" for i, d in enumerate(data.dates))
    prompt = (
        f"Eres un experto en email marketing para negocios hispanos en Estados Unidos.\n"
        f"{lang_hint}\n\n"
        f"Crea una secuencia de {n} correos electrónicos para enviar en estas fechas:\n{dates_list}\n\n"
        f"Objetivo de la secuencia: {data.objective}\n"
        f"Tono: {data.tone}\n\n"
        f"Cada correo debe avanzar lógicamente respecto al anterior (ej: el primero presenta, "
        f"los intermedios refuerzan el valor, el último cierra con urgencia o llamado a la acción claro). "
        f"No repitas el mismo mensaje en cada correo.\n\n"
        f"Puedes usar las variables {{{{nombre}}}}, {{{{empresa}}}} dentro del cuerpo si tiene sentido, se reemplazarán automáticamente.\n\n"
        f"Responde ÚNICAMENTE con un JSON array de {n} objetos, sin texto adicional, con esta forma exacta:\n"
        f'[{{"subject": "...", "body": "..."}}, ...]\n'
        f"El campo body debe ser texto plano con saltos de línea (no HTML)."
    )

    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            raw = raw.strip("`")
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()
        start, end = raw.find("["), raw.rfind("]")
        if start != -1 and end != -1 and end > start:
            raw = raw[start:end + 1]
        emails = json.loads(raw)
        if not isinstance(emails, list):
            raise ValueError("Respuesta no es una lista")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error generando la secuencia con Claude: {str(e)[:200]}")

    result = []
    for i, d in enumerate(data.dates):
        item = emails[i] if i < len(emails) else {"subject": "", "body": ""}
        result.append({"date": d, "subject": item.get("subject", ""), "body": item.get("body", "")})
    return {"emails": result}


class SequenceEmailItem(BaseModel):
    date: str
    subject: str
    body: str


class SequenceCreateRequest(BaseModel):
    name: str
    email_list_id: int
    objective: str
    tone: str = "Profesional"
    language: str = "Español"
    emails: list[SequenceEmailItem]


@router.post("/email/sequences")
def create_email_sequence(
    data: SequenceCreateRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    if not data.emails:
        raise HTTPException(status_code=400, detail="La secuencia necesita al menos un correo")

    sequence = EmailSequence(
        organization_id=current_user.organization_id,
        name=data.name,
        email_list_id=data.email_list_id,
        objective=data.objective,
        tone=data.tone,
        language=data.language,
        status="scheduled",
        created_by=current_user.email,
    )
    session.add(sequence)
    session.commit()
    session.refresh(sequence)

    for i, item in enumerate(data.emails):
        try:
            scheduled_dt = datetime.fromisoformat(item.date.replace("Z", "+00:00"))
            if scheduled_dt.tzinfo is not None:
                from datetime import timezone
                scheduled_dt = scheduled_dt.astimezone(timezone.utc).replace(tzinfo=None)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Fecha inválida: {item.date}")
        job = ScheduledEmailSend(
            organization_id=current_user.organization_id,
            email_list_id=data.email_list_id,
            template_key="general",
            scheduled_at=scheduled_dt,
            initiated_by=current_user.email,
            sequence_id=sequence.id,
            sequence_step=i + 1,
            subject_override=item.subject,
            body_override=item.body,
        )
        session.add(job)
    session.commit()
    return {"ok": True, "sequence_id": sequence.id}


@router.get("/email/sequences")
def list_email_sequences(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    sequences = session.exec(
        select(EmailSequence)
        .where(EmailSequence.organization_id == current_user.organization_id)
        .order_by(EmailSequence.created_at.desc())
    ).all()
    result = []
    for seq in sequences:
        steps = session.exec(
            select(ScheduledEmailSend)
            .where(ScheduledEmailSend.sequence_id == seq.id)
            .order_by(ScheduledEmailSend.sequence_step)
        ).all()
        result.append({
            "id": seq.id,
            "name": seq.name,
            "email_list_id": seq.email_list_id,
            "objective": seq.objective,
            "status": seq.status,
            "created_at": seq.created_at.isoformat(),
            "steps": [
                {
                    "job_id": s.id,
                    "step": s.sequence_step,
                    "subject": s.subject_override,
                    "body": s.body_override,
                    "scheduled_at": s.scheduled_at.isoformat(),
                    "status": s.status,
                    "error": s.error,
                }
                for s in steps
            ],
        })
    return result


class SequenceStepUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    scheduled_at: Optional[str] = None


@router.patch("/email/sequences/{sequence_id}/steps/{job_id}")
def update_sequence_step(
    sequence_id: int,
    job_id: int,
    data: SequenceStepUpdate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    job = session.get(ScheduledEmailSend, job_id)
    if not job or job.organization_id != current_user.organization_id or job.sequence_id != sequence_id:
        raise HTTPException(status_code=404, detail="Paso no encontrado")
    if job.status != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden editar pasos pendientes")
    if data.subject is not None:
        job.subject_override = data.subject
    if data.body is not None:
        job.body_override = data.body
    if data.scheduled_at is not None:
        try:
            new_dt = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            raise HTTPException(status_code=400, detail="Fecha inválida")
        job.scheduled_at = new_dt
    session.add(job)
    session.commit()
    return {"ok": True}


@router.delete("/email/sequences/{sequence_id}")
def delete_email_sequence(
    sequence_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    seq = session.get(EmailSequence, sequence_id)
    if not seq or seq.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Secuencia no encontrada")
    steps = session.exec(
        select(ScheduledEmailSend).where(ScheduledEmailSend.sequence_id == sequence_id)
    ).all()
    for s in steps:
        if s.status == "pending":
            s.status = "cancelled"
            session.add(s)
    seq.status = "cancelled"
    session.add(seq)
    session.commit()
    return {"ok": True}


# ── Scheduled email jobs ────────────────────────────────────────────────────────

@router.get("/email/scheduled")
def list_scheduled_emails(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    jobs = session.exec(
        select(ScheduledEmailSend)
        .where(
            ScheduledEmailSend.organization_id == current_user.organization_id,
            ScheduledEmailSend.status == "pending",
        )
        .order_by(ScheduledEmailSend.scheduled_at)
    ).all()
    return [
        {
            "id": j.id,
            "campaign_id": j.campaign_id,
            "template_key": j.template_key,
            "email_only": j.email_only,
            "scheduled_at": j.scheduled_at.isoformat(),
            "initiated_by": j.initiated_by,
            "created_at": j.created_at.isoformat(),
        }
        for j in jobs
    ]


@router.delete("/email/scheduled/{job_id}")
def cancel_scheduled_email(
    job_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    job = session.get(ScheduledEmailSend, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if job.status != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar trabajos pendientes")
    job.status = "cancelled"
    session.add(job)
    session.commit()
    return {"ok": True}


class RescheduleRequest(BaseModel):
    scheduled_at: str  # ISO datetime string


@router.patch("/email/scheduled/{job_id}")
def reschedule_email(
    job_id: int,
    data: RescheduleRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    job = session.get(ScheduledEmailSend, job_id)
    if not job or job.organization_id != current_user.organization_id:
        raise HTTPException(status_code=404, detail="Trabajo no encontrado")
    if job.status != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden reprogramar trabajos pendientes")
    try:
        new_dt = datetime.fromisoformat(data.scheduled_at.replace("Z", "+00:00")).replace(tzinfo=None)
    except Exception:
        raise HTTPException(status_code=400, detail="Fecha inválida")
    job.scheduled_at = new_dt
    session.add(job)
    session.commit()
    return {"ok": True, "scheduled_at": job.scheduled_at.isoformat()}


@router.post("/email/events")
async def sendgrid_events(
    request: Request,
    session: Session = Depends(get_session),
):
    """Public endpoint that receives SendGrid event webhooks (no auth required)."""
    try:
        body = await request.json()
    except Exception:
        return {"ok": False}

    if not isinstance(body, list):
        body = [body]

    for event in body:
        try:
            event_type = event.get("event", "")
            prospect_email = event.get("email", "")
            org_id_str = event.get("org_id") or (event.get("unique_args") or {}).get("org_id", "")
            template_key = event.get("template_key") or (event.get("unique_args") or {}).get("template_key", "")
            sg_event_id = event.get("sg_event_id") or ""
            sg_message_id = event.get("sg_message_id") or ""
            url = event.get("url") or ""

            if not prospect_email or not org_id_str:
                continue

            org_id = int(org_id_str)

            # Deduplicate by sg_event_id
            if sg_event_id:
                existing = session.exec(
                    select(EmailEvent).where(EmailEvent.sg_event_id == sg_event_id)
                ).first()
                if existing:
                    continue

            ev = EmailEvent(
                organization_id=org_id,
                prospect_email=prospect_email,
                event_type=event_type,
                template_key=template_key or None,
                sg_message_id=sg_message_id or None,
                sg_event_id=sg_event_id or None,
                url=url or None,
            )
            session.add(ev)

            # If unsubscribe event, mark prospect
            if event_type in ("unsubscribe", "spamreport"):
                prospect = session.exec(
                    select(Prospect).where(
                        Prospect.organization_id == org_id,
                        Prospect.email == prospect_email,
                    )
                ).first()
                if prospect:
                    prospect.email_unsubscribed = True
                    session.add(prospect)

        except Exception:
            continue

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
