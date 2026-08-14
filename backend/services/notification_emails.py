import os
import logging
from services.sendgrid_service import _build_html

log = logging.getLogger(__name__)


async def send_notification_email(org, to_email: str, subject: str, greeting: str, body: str) -> None:
    """Fire-and-forget internal notification email (new team member, campaign
    started, agent synced, prospects imported). Reuses the same plain,
    non-flashy template as the prospect-facing emails — no AI-generated feel,
    just a clean confirmation. Never raises — a failed notification must not
    break the action that triggered it."""
    try:
        if not org or not to_email:
            return
        api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "")
        if not api_key:
            return

        html_body = _build_html("#1e40af", greeting, body, "", "", "El equipo de ZyraVoice")

        from_email = (org.email_from or "").strip() or os.getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
        from_name = (org.email_from_name or "").strip() or "ZyraVoice"

        from sendgrid import SendGridAPIClient
        from sendgrid.helpers.mail import Mail

        message = Mail(
            from_email=(from_email, from_name),
            to_emails=to_email,
            subject=subject,
            html_content=html_body,
        )
        sg = SendGridAPIClient(api_key)
        resp = sg.send(message)
        log.info(f"[NotifyEmail] sent to {to_email} subject={subject!r} status={resp.status_code}")
    except Exception as e:
        log.error(f"[NotifyEmail] failed to {to_email} subject={subject!r}: {e}", exc_info=True)
