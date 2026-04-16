from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from database import get_session
from models import Call, Campaign, Prospect, User
from routes.auth import get_current_user
from datetime import datetime, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def global_stats(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    real = Call.is_demo == False  # noqa: E712
    org_filter = (
        (Call.organization_id == current_user.organization_id)
        if current_user.role != "superadmin" else True
    )

    total_calls = session.exec(select(func.count(Call.id)).where(real & org_filter)).one()
    answered = session.exec(
        select(func.count(Call.id)).where(
            real & org_filter & (Call.outcome != "voicemail") & (Call.outcome.is_not(None))
        )
    ).one()
    interested = session.exec(
        select(func.count(Call.id)).where(real & org_filter & (Call.outcome == "interested"))
    ).one()
    appointments = session.exec(
        select(func.count(Call.id)).where(real & org_filter & (Call.appointment_scheduled == True))
    ).one()
    answer_rate = round(answered / total_calls * 100, 1) if total_calls else 0

    days = []
    for i in range(6, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=i)
        count = session.exec(
            select(func.count(Call.id)).where(
                real & org_filter & (func.date(Call.started_at) == str(day))
            )
        ).one()
        days.append({"date": str(day), "calls": count})

    outcomes = {}
    for call in session.exec(select(Call).where(real & org_filter)).all():
        if call.outcome:
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
    ).one()
    pending = session.exec(
        select(func.count(Prospect.id)).where(
            (Prospect.campaign_id == campaign_id) & (Prospect.status == "pending")
        )
    ).one()
    calls = session.exec(
        select(func.count(Call.id)).where(Call.campaign_id == campaign_id)
    ).one()
    interested = session.exec(
        select(func.count(Call.id)).where(
            (Call.campaign_id == campaign_id) & (Call.outcome == "interested")
        )
    ).one()
    appointments = session.exec(
        select(func.count(Call.id)).where(
            (Call.campaign_id == campaign_id) & (Call.appointment_scheduled == True)
        )
    ).one()
    return {
        "campaign_id": campaign_id,
        "total_prospects": total,
        "pending_prospects": pending,
        "total_calls": calls,
        "interested": interested,
        "appointments": appointments,
    }
