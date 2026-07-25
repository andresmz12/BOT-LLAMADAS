from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from models import EmailEvent, EmailSendLog, ScheduledEmailSend


def _rate(numerator: int, denominator: int) -> float:
    return round(numerator / denominator * 100, 1) if denominator else 0.0


def compute_metrics(
    session: Session,
    organization_id: int,
    sequence_id: Optional[int] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
) -> dict:
    """Aggregate EmailEvent (+ EmailSendLog for 'sent') into a metrics dict.

    Computed on-demand with plain SQL filtering — no cached counters. At the
    volumes this tool runs at (thousands, not millions, of events per org)
    this stays comfortably fast; EmailSendLog/EmailSequence are the natural
    place to add incrementally-updated counters later if that changes.
    """
    event_q = select(EmailEvent).where(EmailEvent.organization_id == organization_id)
    log_q = select(EmailSendLog).where(EmailSendLog.organization_id == organization_id)

    if sequence_id is not None:
        event_q = event_q.where(EmailEvent.sequence_id == sequence_id)
        log_q = log_q.where(EmailSendLog.sequence_id == sequence_id)
    if date_from is not None:
        event_q = event_q.where(EmailEvent.timestamp >= date_from)
        log_q = log_q.where(EmailSendLog.sent_at >= date_from)
    if date_to is not None:
        event_q = event_q.where(EmailEvent.timestamp <= date_to)
        log_q = log_q.where(EmailSendLog.sent_at <= date_to)

    events = session.exec(event_q).all()
    logs = session.exec(log_q).all()

    sent = sum(l.total_sent for l in logs)

    by_type: dict[str, list[str]] = {}
    for e in events:
        by_type.setdefault(e.event_type, []).append((e.prospect_email or "").strip().lower())

    def _count(t: str) -> int:
        return len(by_type.get(t, []))

    def _unique(t: str) -> int:
        return len(set(by_type.get(t, [])))

    delivered = _count("delivered")
    opens_total, opens_unique = _count("open"), _unique("open")
    clicks_total, clicks_unique = _count("click"), _unique("click")
    bounces = _count("bounce") + _count("dropped")
    unsubscribes = _count("unsubscribe")
    spam_reports = _count("spamreport")

    # Rates are computed against delivered when we have delivery events, else
    # fall back to sent (some orgs may not have the SendGrid Event Webhook
    # wired up for "delivered" specifically).
    rate_denom = delivered or sent

    return {
        "sent": sent,
        "delivered": delivered,
        "opens_total": opens_total,
        "opens_unique": opens_unique,
        "clicks_total": clicks_total,
        "clicks_unique": clicks_unique,
        "bounces": bounces,
        "unsubscribes": unsubscribes,
        "spam_reports": spam_reports,
        "open_rate": _rate(opens_unique, rate_denom),
        "click_rate": _rate(clicks_unique, rate_denom),
        "bounce_rate": _rate(bounces, sent),
    }


def sequence_step_breakdown(session: Session, organization_id: int, sequence_id: int) -> list[dict]:
    """Per-step opens/clicks — feeds the simple timeline chart in the UI."""
    steps = session.exec(
        select(ScheduledEmailSend)
        .where(ScheduledEmailSend.sequence_id == sequence_id)
        .order_by(ScheduledEmailSend.sequence_step)
    ).all()
    result = []
    for step in steps:
        events = session.exec(
            select(EmailEvent).where(
                EmailEvent.organization_id == organization_id,
                EmailEvent.sequence_id == sequence_id,
                EmailEvent.sequence_step == step.sequence_step,
            )
        ).all()
        opens = len({(e.prospect_email or "").strip().lower() for e in events if e.event_type == "open"})
        clicks = len({(e.prospect_email or "").strip().lower() for e in events if e.event_type == "click"})
        result.append({
            "step": step.sequence_step,
            "subject": step.subject_override,
            "scheduled_at": step.scheduled_at.isoformat(),
            "status": step.status,
            "opens_unique": opens,
            "clicks_unique": clicks,
        })
    return result
