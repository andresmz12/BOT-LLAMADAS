from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from sqlalchemy import true as sql_true
from database import get_session
from models import Call, Campaign, Prospect, User
from routes.auth import get_current_user
from datetime import datetime, timedelta, date as date_type

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def global_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    # Use sqlalchemy true() instead of Python True to avoid expression issues
    org_filter = (
        sql_true()
        if current_user.role == "superadmin"
        else (Call.organization_id == current_user.organization_id)
    )
    # Exclude demo calls
    real = Call.is_demo == False  # noqa: E712
    base = real & org_filter

    total_calls = session.exec(select(func.count(Call.id)).where(base)).one() or 0

    answered = session.exec(
        select(func.count(Call.id)).where(
            base
            & Call.outcome.is_not(None)
            & (Call.outcome != "voicemail")
            & (Call.outcome != "failed")
        )
    ).one() or 0

    interested = session.exec(
        select(func.count(Call.id)).where(base & (Call.outcome == "interested"))
    ).one() or 0

    appointments = session.exec(
        select(func.count(Call.id)).where(base & (Call.appointment_scheduled == True))  # noqa: E712
    ).one() or 0

    answer_rate = round(answered / total_calls * 100, 1) if total_calls else 0

    # Use date-range comparison (portable across SQLite and PostgreSQL)
    today = datetime.utcnow().date()
    days = []
    for i in range(6, -1, -1):
        day = today - timedelta(days=i)
        day_start = datetime(day.year, day.month, day.day, 0, 0, 0)
        day_end = day_start + timedelta(days=1)
        count = session.exec(
            select(func.count(Call.id)).where(
                base
                & (Call.started_at >= day_start)
                & (Call.started_at < day_end)
            )
        ).one() or 0
        # Format: "18 Abr"
        months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun",
                  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
        label = f"{day.day} {months[day.month - 1]}"
        days.append({"date": label, "calls": count})

    # Outcome distribution
    outcomes: dict[str, int] = {}
    for call in session.exec(select(Call).where(base & Call.outcome.is_not(None))).all():
        outcomes[call.outcome] = outcomes.get(call.outcome, 0) + 1

    return {
        "total_calls": total_calls,
        "answer_rate": answer_rate,
        "interested": interested,
        "appointments": appointments,
        "calls_per_day": days,
        "outcome_distribution": [{"name": k, "value": v} for k, v in outcomes.items()],
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
