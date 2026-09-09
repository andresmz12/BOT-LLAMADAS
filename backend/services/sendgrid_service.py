import os
import base64
import html
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

        subject   = _fill(tmpl.get("subject") or DEFAULT_SUBJECT.get(outcome, "Seguimiento"), tmpl_vars, escape=False)
        color     = tmpl.get("color") or org.accent_color or "#4F46E5"
        greeting  = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
        body_text = _fill(tmpl.get("body") or "", tmpl_vars)
        cta_text  = tmpl.get("cta_text") or ""
        cta_url   = tmpl.get("cta_url") or ""
        cta_text_2 = tmpl.get("cta_text_2") or ""
        cta_url_2  = tmpl.get("cta_url_2") or ""
        signature = _fill(tmpl.get("signature") or f"El equipo de {tmpl_vars['agente']}", tmpl_vars)

        try:
            from routes.email_marketing import _unsub_url
            unsub = _unsub_url(prospect.id, org.id)
        except Exception:
            unsub = ""
        html_body = _build_html(color, greeting, body_text, cta_text, cta_url, signature, unsubscribe_url=unsub,
                                 cta_text_2=cta_text_2, cta_url_2=cta_url_2)

        from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
        from_name  = (org.email_from_name or "").strip() or agent_name or "Bot Llamadas"

        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail, CustomArg

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

        # Per-template attachments (slot 1 and 2) take priority over the org's
        # global fallback attachments, slot by slot.
        attachments = _build_attachments(tmpl, org)
        if attachments:
            message.attachment = attachments

        sg = SendGridAPIClient(api_key)
        resp = sg.send(message)
        log.info(f"[EMAIL] sent to {to_email} outcome={outcome} status={resp.status_code}")

    except Exception as e:
        log.error(f"[EMAIL] failed for outcome={outcome}: {e}", exc_info=True)


def _build_attachments(tmpl: dict, org) -> list:
    """Build up to two SendGrid Attachment objects: slot 1 (attachment_b64/
    attachment_name) and slot 2 (attachment_b64_2/attachment_name_2), each
    falling back to the org-wide default when the template has none of its
    own in that slot."""
    from sendgrid.helpers.mail import Attachment, FileContent, FileName, FileType, Disposition

    attachments = []
    slots = [
        (tmpl.get("attachment_b64") or "", tmpl.get("attachment_name") or "",
         org.email_attachment, org.email_attachment_name),
        (tmpl.get("attachment_b64_2") or "", tmpl.get("attachment_name_2") or "",
         org.email_attachment_2, org.email_attachment_2_name),
    ]
    for att_b64, att_name, org_bytes, org_name in slots:
        if not att_b64 and org_bytes and org_name:
            att_b64 = base64.b64encode(org_bytes).decode()
            att_name = org_name
        if att_b64 and att_name:
            ext = att_name.rsplit(".", 1)[-1].lower()
            mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
            attachments.append(Attachment(
                FileContent(att_b64), FileName(att_name), FileType(mime), Disposition("attachment"),
            ))
    return attachments


def _fill(text: str, variables: dict, escape: bool = True) -> str:
    """Substitute {{var}} merge fields into email text. Values are
    HTML-escaped by default since they come from prospect data (CSV import /
    CRM webhook ingestion) — untrusted input that must not be able to inject
    markup into the outbound HTML email body. Pass escape=False for plain-text
    fields (e.g. the subject line), which are never rendered as HTML."""
    for k, v in variables.items():
        value = html.escape(str(v)) if escape else str(v)
        text = text.replace("{{" + k + "}}", value)
    return text


def _format_body(text: str) -> str:
    """Convert plain text (newlines + '- ' bullets) to email-safe HTML."""
    import re
    if not text:
        return ""
    parts = []
    for para in re.split(r'\n{2,}', text.strip()):
        lines = [l for l in para.split('\n') if l.strip()]
        if not lines:
            continue
        if all(l.strip().startswith('- ') for l in lines):
            items = ''.join(
                f'<li style="margin:3px 0;color:#374151;font-size:14px">{l.strip()[2:]}</li>'
                for l in lines
            )
            parts.append(f'<ul style="margin:4px 0 14px;padding-left:20px">{items}</ul>')
        else:
            inner = '<br>'.join(l for l in lines)
            parts.append(f'<p style="margin:0 0 14px;line-height:1.75;color:#374151;font-size:14px">{inner}</p>')
    return ''.join(parts)


def _format_signature(text: str) -> str:
    """Convert signature plain text to HTML."""
    if not text:
        return ""
    return '<br>'.join(line for line in text.split('\n'))


def _cta_button(text: str, url: str, primary: bool = True) -> str:
    label = text or ("Ver más →" if url else "")
    if not label or not url:
        return ""
    bg = "#1e40af" if primary else "#475569"
    return (
        f'<a href="{url}" style="background:{bg};color:#fff;padding:10px 24px;'
        f'border-radius:4px;text-decoration:none;font-weight:600;margin:0 6px;display:inline-block;font-size:13px">{label}</a>'
    )


def _build_html(color: str, greeting: str, body: str, cta_text: str, cta_url: str, signature: str,
                 unsubscribe_url: str = "", cta_text_2: str = "", cta_url_2: str = "") -> str:
    btn1 = _cta_button(cta_text, cta_url, primary=True)
    btn2 = _cta_button(cta_text_2, cta_url_2, primary=False)
    # Explicit &nbsp; separator (not just CSS margin) so the two buttons never
    # visually run together — some email clients strip inline margin on <a>.
    buttons = f"{btn1}&nbsp;&nbsp;&nbsp;&nbsp;{btn2}" if (btn1 and btn2) else (btn1 or btn2)
    cta_block = f'<p style="text-align:center;margin:24px 0">{buttons}</p>' if buttons else ""
    unsub_block = ""
    if unsubscribe_url:
        unsub_block = (
            f'<p style="margin:10px 0 0;font-size:11px;color:#9ca3af">'
            f'<a href="{unsubscribe_url}" style="color:#9ca3af;text-decoration:underline">Cancelar suscripción</a></p>'
        )
    body_html = _format_body(body)
    sig_html = _format_signature(signature)
    return f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;color:#111827">
  <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb">
    <p style="margin:0 0 16px;color:#111827;font-size:14px">{greeting}</p>
    <div style="line-height:1.75;color:#374151;font-size:14px">{body_html}</div>
    {cta_block}
  </div>
  <div style="padding:16px 32px;background:#f9fafb">
    <p style="color:#6b7280;font-size:12px;margin:0">{sig_html}</p>
    {unsub_block}
  </div>
</div>"""
