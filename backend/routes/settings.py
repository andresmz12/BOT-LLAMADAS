import csv
import io
import json
import os
import asyncio
import base64 as _b64
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session, select
from sqlalchemy import desc, func
from database import get_session
from models import User, Organization, WebhookLog, Prospect, Campaign, EmailSendLog, EmailEvent
from routes.auth import get_current_user, require_write_access, require_superadmin

APP_BASE_URL = os.getenv("APP_BASE_URL", "").rstrip("/")


def _unsub_token(prospect_id: int, org_id: int) -> str:
    return _b64.urlsafe_b64encode(f"{prospect_id}:{org_id}".encode()).decode()


def _unsub_url(prospect_id: int, org_id: int) -> str:
    if not APP_BASE_URL:
        return ""
    return f"{APP_BASE_URL}/settings/email/unsubscribe?token={_unsub_token(prospect_id, org_id)}"

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
        org.email_templates = json.dumps(data.email_templates)
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
        raise HTTPException(status_code=400, detail=f"Error al enviar: {str(e)}")


class BulkEmailRequest(BaseModel):
    campaign_id: Optional[int] = None   # None = all org prospects with email
    template_key: str = "general"       # which template to use
    email_only: bool = False            # True = only campaign_id IS NULL contacts


@router.post("/email/bulk-send")
async def bulk_send_email(
    data: BulkEmailRequest,
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

    # Load prospects — skip unsubscribed
    query = select(Prospect).where(
        Prospect.organization_id == current_user.organization_id,
        Prospect.email.is_not(None),
        Prospect.email != "",
        Prospect.email_unsubscribed == False,  # noqa: E712
    )
    if data.email_only:
        query = query.where(Prospect.campaign_id == None)  # noqa: E711
    elif data.campaign_id:
        query = query.where(Prospect.campaign_id == data.campaign_id)
    prospects = session.exec(query).all()
    if not prospects:
        raise HTTPException(status_code=400, detail="No hay prospectos con email válido en esta selección")

    from services.sendgrid_service import _fill, _build_html, DEFAULT_SUBJECT
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition, CustomArg

    templates = {}
    if org.email_templates:
        try:
            templates = json.loads(org.email_templates)
        except Exception:
            pass
    tmpl = templates.get(data.template_key, {})

    # Per-template attachment or global fallback
    att_b64 = tmpl.get("attachment_b64") or ""
    att_name = tmpl.get("attachment_name") or ""
    if not att_b64 and org.email_attachment and org.email_attachment_name:
        att_b64 = _b64.b64encode(org.email_attachment).decode()
        att_name = org.email_attachment_name

    from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
    from_name  = (org.email_from_name or "").strip() or "ZyraVoice"
    delay_s = (org.email_send_delay_ms or 0) / 1000.0
    sg = SendGridAPIClient(api_key)

    sent = 0
    skipped = 0
    errors = []

    # Resolve campaign name for the log
    if data.email_only:
        camp_name = "Contactos de email"
    elif data.campaign_id:
        camp = session.get(Campaign, data.campaign_id)
        camp_name = camp.name if camp else None
    else:
        camp_name = None

    for prospect in prospects:
        try:
            unsub = _unsub_url(prospect.id, org.id)
            tmpl_vars = {
                "nombre":   prospect.name or "",
                "empresa":  prospect.company or "",
                "agente":   from_name,
                "resumen":  "",
                "telefono": prospect.phone or "",
                "fecha":    datetime.utcnow().strftime("%d/%m/%Y"),
            }
            subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(data.template_key, "Mensaje de ZyraVoice"), tmpl_vars)
            color     = tmpl.get("color") or "#4F46E5"
            greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
            body_text = _fill(tmpl.get("body") or "", tmpl_vars)
            cta_text  = tmpl.get("cta_text") or ""
            cta_url   = tmpl.get("cta_url") or ""
            signature = _fill(tmpl.get("signature") or f"El equipo de {from_name}", tmpl_vars)
            html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature, unsubscribe_url=unsub)

            message = Mail(
                from_email=(from_email, from_name),
                to_emails=prospect.email,
                subject=subject,
                html_content=html_body,
            )
            message.custom_arg = [
                CustomArg(key="org_id", value=str(org.id)),
                CustomArg(key="template_key", value=data.template_key),
            ]
            if att_b64 and att_name:
                ext = att_name.rsplit(".", 1)[-1].lower()
                mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
                message.attachment = Attachment(
                    FileContent(att_b64), FileName(att_name), FileType(mime), Disposition("attachment"),
                )
            sg.send(message)

            # Update prospect email stats
            prospect.last_email_sent_at = datetime.utcnow()
            prospect.email_send_count = (prospect.email_send_count or 0) + 1
            session.add(prospect)

            sent += 1
            if delay_s > 0:
                await asyncio.sleep(delay_s)
        except Exception as e:
            errors.append({"email": prospect.email, "error": str(e)[:80]})
            skipped += 1

    session.commit()

    # Save send log
    log_entry = EmailSendLog(
        organization_id=current_user.organization_id,
        template_key=data.template_key,
        template_subject=tmpl.get("subject") or "",
        campaign_id=data.campaign_id,
        campaign_name=camp_name,
        total_sent=sent,
        total_skipped=skipped,
        total_errors=len(errors),
        error_details=json.dumps(errors) if errors else None,
        initiated_by=current_user.email,
    )
    session.add(log_entry)
    session.commit()

    return {"sent": sent, "skipped": skipped, "errors": errors[:5]}


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
            "total_sent": l.total_sent,
            "total_skipped": l.total_skipped,
            "total_errors": l.total_errors,
            "initiated_by": l.initiated_by,
        }
        for l in logs
    ]


@router.get("/email/validate-recipients")
def validate_email_recipients(
    campaign_id: Optional[int] = None,
    email_only: bool = False,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return {"total": 0, "with_email": 0, "without_email": 0, "unsubscribed": 0, "will_receive": 0}

    base = select(Prospect).where(Prospect.organization_id == current_user.organization_id)
    if email_only:
        base = base.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
        base = base.where(Prospect.campaign_id == campaign_id)
    all_prospects = session.exec(base).all()

    total = len(all_prospects)
    with_email = sum(1 for p in all_prospects if (p.email or "").strip())
    unsubscribed = sum(1 for p in all_prospects if (p.email or "").strip() and p.email_unsubscribed)
    will_receive = with_email - unsubscribed
    without_email = total - with_email

    return {
        "total": total,
        "with_email": with_email,
        "without_email": without_email,
        "unsubscribed": unsubscribed,
        "will_receive": will_receive,
    }


@router.get("/email/unsubscribe", response_class=HTMLResponse)
def email_unsubscribe(
    token: str = "",
    session: Session = Depends(get_session),
):
    try:
        decoded = _b64.urlsafe_b64decode(token.encode()).decode()
        prospect_id, org_id = decoded.split(":")
        prospect = session.get(Prospect, int(prospect_id))
        if prospect and prospect.organization_id == int(org_id):
            prospect.email_unsubscribed = True
            session.add(prospect)
            session.commit()
            name = prospect.name or "Estimado/a"
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
    template_key: str,
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
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        raise HTTPException(status_code=400, detail="Sin organización")
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

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

    # Parse rows from CSV or Excel
    rows = []
    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(contents), read_only=True, data_only=True)
        ws = wb.active
        headers = None
        for excel_row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip().lower() if c is not None else "" for c in excel_row]
            else:
                rows.append({headers[j]: (str(v).strip() if v is not None else "") for j, v in enumerate(excel_row) if j < len(headers)})
    else:
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = contents.decode("latin-1")
        reader_obj = csv.DictReader(io.StringIO(text))
        rows = [{k.strip().lower(): v for k, v in r.items()} for r in reader_obj]

    # Fetch existing emails in org to deduplicate
    existing = {
        (p.email or "").lower()
        for p in session.exec(
            select(Prospect).where(Prospect.organization_id == current_user.organization_id)
        ).all()
        if p.email
    }

    imported = 0
    skipped = 0
    errors = []

    for i, row in enumerate(rows, start=2):
        raw_email_field = _find(row, "email", "correo", "e-mail", "mail")
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
