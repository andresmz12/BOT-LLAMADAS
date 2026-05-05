from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select, func
from sqlalchemy import true as sql_true
from database import get_session, engine as db_engine
from models import Call, Campaign, Prospect, User, EmailSendLog, EmailEvent
from routes.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])

_CONTACTED_OUTCOMES = ("interested", "not_interested", "callback_requested", "appointment_scheduled", "wrong_number")


@router.get("")
def global_stats(
    organization_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role == "superadmin":
        org_filter = (Call.organization_id == organization_id) if organization_id else sql_true()
    else:
        org_filter = Call.organization_id == current_user.organization_id
    real = Call.is_demo == False  # noqa: E712
    base = real & org_filter

    total_calls = session.exec(select(func.count(Call.id)).where(base)).one() or 0

    contacted = session.exec(
        select(func.count(Call.id)).where(base & Call.outcome.in_(_CONTACTED_OUTCOMES))
    ).one() or 0

    interested = session.exec(
        select(func.count(Call.id)).where(base & (Call.outcome == "interested"))
    ).one() or 0

    not_interested = session.exec(
        select(func.count(Call.id)).where(base & (Call.outcome == "not_interested"))
    ).one() or 0

    callback_requested = session.exec(
        select(func.count(Call.id)).where(base & (Call.outcome == "callback_requested"))
    ).one() or 0

    voicemail_count = session.exec(
        select(func.count(Call.id)).where(base & (Call.outcome == "voicemail"))
    ).one() or 0

    appointments = session.exec(
        select(func.count(Call.id)).where(base & (Call.appointment_scheduled == True))  # noqa: E712
    ).one() or 0

    # Average duration of calls where a real person answered
    avg_dur_result = session.exec(
        select(func.avg(Call.duration_seconds)).where(
            base & Call.outcome.in_(_CONTACTED_OUTCOMES) & Call.duration_seconds.is_not(None)
        )
    ).one()
    avg_duration = round(float(avg_dur_result), 0) if avg_dur_result else 0

    contact_rate = round(contacted / total_calls * 100, 1) if total_calls else 0

    # Per-day: calls, contacted, interested (last 7 days)
    today = datetime.utcnow().date()
    months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"]
    days = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day)
        day_end = day_start + timedelta(days=1)
        time_filter = (Call.started_at >= day_start) & (Call.started_at < day_end)

        d_calls = session.exec(select(func.count(Call.id)).where(base & time_filter)).one() or 0
        d_contacted = session.exec(
            select(func.count(Call.id)).where(base & time_filter & Call.outcome.in_(_CONTACTED_OUTCOMES))
        ).one() or 0
        d_interested = session.exec(
            select(func.count(Call.id)).where(base & time_filter & (Call.outcome == "interested"))
        ).one() or 0

        days.append({
            "date": f"{day.day} {months[day.month - 1]}",
            "calls": d_calls,
            "contacted": d_contacted,
            "interested": d_interested,
        })

    # Outcome distribution + calls by hour (single pass over all calls)
    outcomes: dict[str, int] = {}
    hour_data: dict[int, dict] = {}
    for call in session.exec(select(Call).where(base)).all():
        if call.outcome:
            outcomes[call.outcome] = outcomes.get(call.outcome, 0) + 1
        if call.started_at:
            h = call.started_at.hour
            if h not in hour_data:
                hour_data[h] = {"calls": 0, "contacted": 0}
            hour_data[h]["calls"] += 1
            if call.outcome in _CONTACTED_OUTCOMES:
                hour_data[h]["contacted"] += 1

    calls_by_hour = [
        {
            "hour": h,
            "calls": v["calls"],
            "contacted": v["contacted"],
            "contact_rate": round(v["contacted"] / v["calls"] * 100, 1) if v["calls"] else 0,
        }
        for h, v in sorted(hour_data.items())
    ]

    # Calls by hour of day (optimal call time)
    from collections import defaultdict
    hour_buckets: dict = defaultdict(lambda: {"calls": 0, "contacted": 0})
    for c in session.exec(select(Call).where(base & Call.started_at.is_not(None))).all():
        h = c.started_at.hour
        hour_buckets[h]["calls"] += 1
        if c.outcome in _CONTACTED_OUTCOMES:
            hour_buckets[h]["contacted"] += 1

    def _hour_label(h: int) -> str:
        if h == 0: return "12am"
        if h < 12: return f"{h}am"
        if h == 12: return "12pm"
        return f"{h - 12}pm"

    calls_by_hour = [
        {
            "hour": h,
            "label": _hour_label(h),
            "calls": hour_buckets[h]["calls"],
            "contact_rate": round(
                hour_buckets[h]["contacted"] / hour_buckets[h]["calls"] * 100, 1
            ) if hour_buckets[h]["calls"] else 0,
        }
        for h in range(24)
    ]

    # Recent interested prospects (last 10)
    recent_interested = []
    interested_calls = session.exec(
        select(Call).where(base & (Call.outcome == "interested"))
        .order_by(Call.started_at.desc())
        .limit(10)
    ).all()
    for c in interested_calls:
        prospect = session.get(Prospect, c.prospect_id) if c.prospect_id else None
        campaign = session.get(Campaign, c.campaign_id) if c.campaign_id else None
        recent_interested.append({
            "call_id": c.id,
            "prospect_name": prospect.name if prospect else "—",
            "prospect_company": prospect.company or "—" if prospect else "—",
            "prospect_phone": prospect.phone if prospect else "—",
            "campaign_name": campaign.name if campaign else "—",
            "started_at": c.started_at.isoformat() if c.started_at else None,
        })

    return {
        "total_calls": total_calls,
        "contacted": contacted,
        "contact_rate": contact_rate,
        "interested": interested,
        "not_interested": not_interested,
        "callback_requested": callback_requested,
        "voicemail_count": voicemail_count,
        "appointments": appointments,
        "avg_duration": int(avg_duration),
        "answer_rate": contact_rate,  # keep for backward compat
        "calls_per_day": days,
        "outcome_distribution": [{"name": k, "value": v} for k, v in outcomes.items()],
        "calls_by_hour": calls_by_hour,
        "recent_interested": recent_interested,
        "calls_by_hour": calls_by_hour,
    }


@router.get("/email")
def email_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org_id = current_user.organization_id
    if not org_id:
        return _empty_email_stats()

    # Aggregate from EmailSendLog (bulk sends)
    logs = session.exec(
        select(EmailSendLog).where(EmailSendLog.organization_id == org_id)
    ).all()
    total_sent = sum(l.total_sent for l in logs)
    total_errors = sum(l.total_errors for l in logs)

    # Aggregate from EmailEvent (tracking events from SendGrid)
    try:
        events = session.exec(
            select(EmailEvent).where(EmailEvent.organization_id == org_id)
        ).all()
    except Exception:
        events = []

    delivered = sum(1 for e in events if e.event_type == "delivered")
    opens = sum(1 for e in events if e.event_type == "open")
    unique_opens = len({e.prospect_email for e in events if e.event_type == "open"})
    clicks = sum(1 for e in events if e.event_type == "click")
    unique_clicks = len({e.prospect_email for e in events if e.event_type == "click"})
    bounces = sum(1 for e in events if e.event_type in ("bounce", "dropped"))
    unsubscribes = sum(1 for e in events if e.event_type in ("unsubscribe", "spamreport"))

    open_rate = round(unique_opens / delivered * 100, 1) if delivered else 0
    click_rate = round(unique_clicks / delivered * 100, 1) if delivered else 0
    bounce_rate = round(bounces / total_sent * 100, 1) if total_sent else 0
    delivery_rate = round(delivered / total_sent * 100, 1) if total_sent else 0

    today = datetime.utcnow().date()
    months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    by_day = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day)
        day_end = day_start + timedelta(days=1)
        day_logs = [l for l in logs if day_start <= l.sent_at < day_end]
        day_events = [e for e in events if day_start <= e.timestamp < day_end]
        by_day.append({
            "date": f"{day.day} {months[day.month - 1]}",
            "sent": sum(l.total_sent for l in day_logs),
            "delivered": sum(1 for e in day_events if e.event_type == "delivered"),
            "opens": sum(1 for e in day_events if e.event_type == "open"),
            "clicks": sum(1 for e in day_events if e.event_type == "click"),
        })

    tmpl_keys = {l.template_key for l in logs if l.template_key}
    by_template = []
    for key in sorted(tmpl_keys):
        key_logs = [l for l in logs if l.template_key == key]
        key_events = [e for e in events if e.template_key == key]
        s = sum(l.total_sent for l in key_logs)
        d = sum(1 for e in key_events if e.event_type == "delivered")
        o = len({e.prospect_email for e in key_events if e.event_type == "open"})
        c = len({e.prospect_email for e in key_events if e.event_type == "click"})
        by_template.append({
            "key": key,
            "sent": s,
            "delivered": d,
            "open_rate": round(o / d * 100, 1) if d else 0,
            "click_rate": round(c / d * 100, 1) if d else 0,
        })

    recent_sends = sorted(logs, key=lambda l: l.sent_at, reverse=True)[:10]

    return {
        "total_sent": total_sent,
        "total_errors": total_errors,
        "delivered": delivered,
        "delivery_rate": delivery_rate,
        "opens": opens,
        "unique_opens": unique_opens,
        "open_rate": open_rate,
        "clicks": clicks,
        "unique_clicks": unique_clicks,
        "click_rate": click_rate,
        "bounces": bounces,
        "bounce_rate": bounce_rate,
        "unsubscribes": unsubscribes,
        "by_day": by_day,
        "by_template": by_template,
        "recent_sends": [
            {
                "sent_at": l.sent_at.isoformat(),
                "template_key": l.template_key,
                "campaign_name": l.campaign_name,
                "total_sent": l.total_sent,
                "total_errors": l.total_errors,
                "initiated_by": l.initiated_by,
            }
            for l in recent_sends
        ],
    }


def _empty_email_stats():
    return {
        "total_sent": 0, "total_errors": 0, "delivered": 0, "delivery_rate": 0,
        "opens": 0, "unique_opens": 0, "open_rate": 0,
        "clicks": 0, "unique_clicks": 0, "click_rate": 0,
        "bounces": 0, "bounce_rate": 0, "unsubscribes": 0,
        "by_day": [], "by_template": [], "recent_sends": [],
    }


@router.get("/{campaign_id}")
def campaign_stats(
    campaign_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        return {}
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        return {}

    total = session.exec(
        select(func.count(Prospect.id)).where(Prospect.campaign_id == campaign_id)
    ).one() or 0
    pending = session.exec(
        select(func.count(Prospect.id)).where(
            (Prospect.campaign_id == campaign_id) & (Prospect.status == "pending")
        )
    ).one() or 0
    calls = session.exec(
        select(func.count(Call.id)).where(Call.campaign_id == campaign_id)
    ).one() or 0
    interested = session.exec(
        select(func.count(Call.id)).where(
            (Call.campaign_id == campaign_id) & (Call.outcome == "interested")
        )
    ).one() or 0
    appointments = session.exec(
        select(func.count(Call.id)).where(
            (Call.campaign_id == campaign_id) & (Call.appointment_scheduled == True)  # noqa: E712
        )
    ).one() or 0

    return {
        "campaign_id": campaign_id,
        "total_prospects": total,
        "pending_prospects": pending,
        "total_calls": calls,
        "interested": interested,
        "appointments": appointments,
    }


