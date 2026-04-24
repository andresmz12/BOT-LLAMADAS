from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from sqlalchemy import true as sql_true
from database import get_session
from models import Call, Campaign, Prospect, User
from routes.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])

_CONTACTED_OUTCOMES = ("interested", "not_interested", "callback_requested", "appointment_scheduled", "wrong_number")


@router.get("")
def global_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org_filter = (
        sql_true()
        if current_user.role == "superadmin"
        else (Call.organization_id == current_user.organization_id)
    )
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

    # Outcome distribution
    outcomes: dict[str, int] = {}
    for call in session.exec(select(Call).where(base & Call.outcome.is_not(None))).all():
        outcomes[call.outcome] = outcomes.get(call.outcome, 0) + 1

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
        "recent_interested": recent_interested,
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
