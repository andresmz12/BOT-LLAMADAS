from datetime import datetime
from typing import Optional

from sqlmodel import Session, select

from models import Organization, SendingDomain


def reserve_daily_send(session: Session, org: Organization) -> bool:
    """Atomically-ish check+increment the org's daily email counter.

    Returns False once org.email_daily_limit is reached for today — callers
    must stop sending further emails for this org until the counter resets
    (rolls over at UTC midnight, mirroring the existing minutes_used_month
    pattern in routes/webhook.py). A None limit means unlimited.

    Like the pre-existing call-minutes counter, this is a read-then-write
    update rather than a SQL-level atomic increment — acceptable at this
    app's concurrency level (a handful of background senders per org, not
    a high-throughput queue), consistent with how minutes_used_month works.
    """
    if not org.email_daily_limit:
        return True
    today = datetime.utcnow().date()
    if not org.email_sent_today_date or org.email_sent_today_date.date() != today:
        org.email_sent_today = 0
        org.email_sent_today_date = datetime.utcnow()
    if org.email_sent_today >= org.email_daily_limit:
        return False
    org.email_sent_today += 1
    session.add(org)
    session.commit()
    return True


def get_active_domains(session: Session, organization_id: int) -> list[SendingDomain]:
    return session.exec(
        select(SendingDomain).where(
            SendingDomain.organization_id == organization_id,
            SendingDomain.is_active == True,  # noqa: E712
        )
    ).all()


def pick_sender(
    domains: list[SendingDomain],
    index: int,
    fallback_email: str,
    fallback_name: str,
) -> tuple[str, str]:
    """Round-robin across active SendingDomain rows. With zero or one active
    domain this always returns the fallback (org's single email_from/
    email_from_name) — existing single-sender orgs see no behavior change."""
    if not domains:
        return fallback_email, fallback_name
    d = domains[index % len(domains)]
    return d.email, (d.name or fallback_name)
