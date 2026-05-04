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
    "general":            "Mensaje de seguimiento",
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
        if getattr(prospect, "email_unsubscribed", False):
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

        try:
            from routes.settings import _unsub_url
            unsub = _unsub_url(prospect.id, org.id)
        except Exception:
            unsub = ""
        html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature, unsubscribe_url=unsub)

        from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
        from_name  = (org.email_from_name or "").strip() or agent_name or "Bot Llamadas"

        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import (
            Mail, Attachment, FileContent, FileName, FileType, Disposition, CustomArg
        )

        message = Mail(
            from_email=(from_email, from_name),
            to_emails=to_email,
            subject=subject,
            html_content=html_body,
        )
        message.custom_arg = [
            CustomArg(key="org_id", value=str(org.id)),
            CustomArg(key="template_key", value=outcome),
        ]

        # Per-template attachment takes priority over global attachment
        att_b64 = tmpl.get("attachment_b64") or ""
        att_name = tmpl.get("attachment_name") or ""
        if not att_b64 and org.email_attachment and org.email_attachment_name:
            att_b64 = base64.b64encode(org.email_attachment).decode()
            att_name = org.email_attachment_name
        if att_b64 and att_name:
            ext = att_name.rsplit(".", 1)[-1].lower()
            mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
            message.attachment = Attachment(
                FileContent(att_b64), FileName(att_name), FileType(mime), Disposition("attachment"),
            )

        sg = SendGridAPIClient(api_key)
        resp = sg.send(message)
        log.info(f"[EMAIL] sent to {to_email} outcome={outcome} status={resp.status_code}")

    except Exception as e:
        log.error(f"[EMAIL] failed for outcome={outcome}: {e}", exc_info=True)


def _fill(text: str, variables: dict) -> str:
    for k, v in variables.items():
        text = text.replace("{{" + k + "}}", str(v))
    return text


def _build_html(color: str, greeting: str, body: str, cta_text: str, cta_url: str, signature: str, unsubscribe_url: str = "") -> str:
    cta_block = ""
    if cta_text and cta_url:
        cta_block = (
            f'<p style="text-align:center;margin:24px 0">'
            f'<a href="{cta_url}" style="background:#1e40af;color:#fff;padding:12px 28px;'
            f'border-radius:4px;text-decoration:none;font-weight:600">{cta_text}</a></p>'
        )
    unsub_block = ""
    if unsubscribe_url:
        unsub_block = (
            f'<p style="margin:10px 0 0;font-size:11px;color:#9ca3af">'
            f'<a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>'
        )
    return f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;color:#111827">
  <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb">
    <p style="margin:0 0 16px;color:#111827;font-size:14px">{greeting}</p>
    <div style="white-space:pre-wrap;line-height:1.75;color:#374151;font-size:14px">{body}</div>
    {cta_block}
  </div>
  <div style="padding:16px 32px;background:#f9fafb">
    <p style="color:#6b7280;font-size:12px;margin:0;white-space:pre-wrap">{signature}</p>
    {unsub_block}
  </div>
</div>"""
