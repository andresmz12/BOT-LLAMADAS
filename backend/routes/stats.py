from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from database import get_session
from models import Call, Campaign, Prospect
from datetime import datetime, timedelta

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("")
def global_stats(session: Session = Depends(get_session)):
    total_calls = session.exec(select(func.count(Call.id))).one()
    answered = session.exec(
        select(func.count(Call.id)).where(
            (Call.outcome != "voicemail") & (Call.outcome.is_not(None))
        )
    ).one()
    interested = session.exec(
        select(func.count(Call.id)).where(Call.outcome == "interested")
    ).one()
    appointments = session.exec(
        select(func.count(Call.id)).where(Call.appointment_scheduled == True)
    ).one()
    answer_rate = round(answered / total_calls * 100, 1) if total_calls else 0

    days = []
    for i in range(6, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=i)
        count = session.exec(
            select(func.count(Call.id)).where(
                func.date(Call.started_at) == str(day)
            )
        ).one()
        days.append({"date": str(day), "calls": count})

    outcomes = {}
    for call in session.exec(select(Call)).all():
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
def campaign_stats(campaign_id: int, session: Session = Depends(get_session)):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
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
