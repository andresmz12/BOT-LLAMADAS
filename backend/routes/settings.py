import json
import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session, select
from sqlalchemy import desc
from database import get_session
from models import User, Organization, WebhookLog, Prospect, Campaign
from routes.auth import get_current_user, require_write_access, require_superadmin

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
        if org.email_attachment and org.email_attachment_name:
            ext = org.email_attachment_name.rsplit(".", 1)[-1].lower()
            mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
            message.attachment = Attachment(
                FileContent(_b64.b64encode(org.email_attachment).decode()),
                FileName(org.email_attachment_name),
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

    # Load prospects
    query = select(Prospect).where(
        Prospect.organization_id == current_user.organization_id,
        Prospect.email.is_not(None),
        Prospect.email != "",
    )
    if data.campaign_id:
        query = query.where(Prospect.campaign_id == data.campaign_id)
    prospects = session.exec(query).all()
    if not prospects:
        raise HTTPException(status_code=400, detail="No hay prospectos con email en esta selección")

    # Load template
    from services.sendgrid_service import _fill, _build_html, DEFAULT_SUBJECT
    import json as _json
    from datetime import datetime as _dt
    from sendgrid import SendGridAPIClient
    from sendgrid.helpers.mail import Mail
    import base64 as _b64

    templates = {}
    if org.email_templates:
        try:
            templates = _json.loads(org.email_templates)
        except Exception:
            pass
    tmpl = templates.get(data.template_key, {})

    from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
    from_name  = (org.email_from_name or "").strip() or "ZyraVoice"
    sg = SendGridAPIClient(api_key)

    sent = 0
    skipped = 0
    errors = []

    for prospect in prospects:
        try:
            tmpl_vars = {
                "nombre":   prospect.name or "",
                "empresa":  prospect.company or "",
                "agente":   from_name,
                "resumen":  "",
                "telefono": prospect.phone or "",
                "fecha":    _dt.utcnow().strftime("%d/%m/%Y"),
            }
            subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(data.template_key, "Mensaje de ZyraVoice"), tmpl_vars)
            color     = tmpl.get("color") or "#4F46E5"
            greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
            body_text = _fill(tmpl.get("body") or "", tmpl_vars)
            cta_text  = tmpl.get("cta_text") or ""
            cta_url   = tmpl.get("cta_url") or ""
            signature = _fill(tmpl.get("signature") or f"El equipo de {from_name}", tmpl_vars)
            html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature)

            message = Mail(
                from_email=(from_email, from_name),
                to_emails=prospect.email,
                subject=subject,
                html_content=html_body,
            )
            if org.email_attachment and org.email_attachment_name:
                from sendgrid.helpers.mail import Attachment, FileContent, FileName, FileType, Disposition
                ext = org.email_attachment_name.rsplit(".", 1)[-1].lower()
                mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
                message.attachment = Attachment(
                    FileContent(_b64.b64encode(org.email_attachment).decode()),
                    FileName(org.email_attachment_name),
                    FileType(mime),
                    Disposition("attachment"),
                )
            sg.send(message)
            sent += 1
        except Exception as e:
            errors.append({"email": prospect.email, "error": str(e)[:80]})
            skipped += 1

    return {"sent": sent, "skipped": skipped, "errors": errors[:5]}


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
