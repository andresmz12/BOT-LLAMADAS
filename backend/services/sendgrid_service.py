import os
import base64
import json
import logging
from datetime import datetime

log = logging.getLogger(__name__)

OUTCOME_FLAG = {
    "interested":         "email_send_on_interested",
    "callback_requested": "email_send_on_callback",
    "voicemail":          "email_send_on_voicemail",
    "not_interested":     "email_send_on_not_interested",
}

DEFAULT_SUBJECT = {
    "interested":         "Gracias por su interés — próximos pasos",
    "callback_requested": "Le llamaremos pronto",
    "voicemail":          "Le dejamos un mensaje de voz",
    "not_interested":     "Fue un gusto hablar con usted",
}


async def send_post_call_email(org, prospect, outcome: str, summary, agent_name: str):
    """Fire-and-forget post-call email. Logs errors, never raises."""
    try:
        if not org.email_enabled:
            return

        api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "")
        if not api_key:
            return

        flag_field = OUTCOME_FLAG.get(outcome)
        if not flag_field or not getattr(org, flag_field, False):
            return

        if not prospect:
            return
        to_email = (getattr(prospect, "email", "") or "").strip()
        if not to_email:
            return

        tmpl_vars = {
            "nombre":   prospect.name or "",
            "empresa":  getattr(prospect, "company", "") or "",
            "agente":   agent_name or "Isabella",
            "resumen":  summary or "",
            "telefono": prospect.phone or "",
            "fecha":    datetime.utcnow().strftime("%d/%m/%Y"),
        }

        templates: dict = {}
        if org.email_templates:
            try:
                templates = json.loads(org.email_templates)
            except Exception:
                pass
        tmpl = templates.get(outcome, {})

        subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(outcome, "Seguimiento"), tmpl_vars)
        color     = tmpl.get("color") or "#4F46E5"
        greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
        body_text = _fill(tmpl.get("body") or "", tmpl_vars)
        cta_text  = tmpl.get("cta_text") or ""
        cta_url   = tmpl.get("cta_url") or ""
        signature = _fill(tmpl.get("signature") or f"El equipo de {tmpl_vars['agente']}", tmpl_vars)

        html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature)

        from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
        from_name  = (org.email_from_name or "").strip() or agent_name or "Bot Llamadas"

        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import (
            Mail, Attachment, FileContent, FileName, FileType, Disposition
        )

        message = Mail(
            from_email=(from_email, from_name),
            to_emails=to_email,
            subject=subject,
            html_content=html_body,
        )

        if org.email_attachment and org.email_attachment_name:
            ext = org.email_attachment_name.rsplit(".", 1)[-1].lower()
            mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
            att = Attachment(
                FileContent(base64.b64encode(org.email_attachment).decode()),
                FileName(org.email_attachment_name),
                FileType(mime),
                Disposition("attachment"),
            )
            message.attachment = att

        sg = SendGridAPIClient(api_key)
        resp = sg.send(message)
        log.info(f"[EMAIL] sent to {to_email} outcome={outcome} status={resp.status_code}")

    except Exception as e:
        log.error(f"[EMAIL] failed for outcome={outcome}: {e}", exc_info=True)


def _fill(text: str, variables: dict) -> str:
    for k, v in variables.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


def _build_html(color: str, greeting: str, body: str, cta_text: str, cta_url: str, signature: str) -> str:
    cta_block = ""
    if cta_text and cta_url:
        cta_block = (
            f'<p style="text-align:center;margin:24px 0">'
            f'<a href="{cta_url}" style="background:{color};color:#fff;padding:12px 28px;'
            f'border-radius:6px;text-decoration:none;font-weight:600">{cta_text}</a></p>'
        )
    return f"""<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:{color};padding:20px 28px">
    <h1 style="color:#fff;margin:0;font-size:18px">Mensaje de seguimiento</h1>
  </div>
  <div style="padding:28px">
    <p style="margin-bottom:16px">{greeting}</p>
    <div style="white-space:pre-wrap;line-height:1.6">{body}</div>
    {cta_block}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0">
    <p style="color:#6b7280;font-size:13px;margin:0">{signature}</p>
  </div>
</div>"""
