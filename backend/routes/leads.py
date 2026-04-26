from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlmodel import Session, select
from sqlalchemy import true as sql_true
from database import get_session
from models import Call, Prospect, Campaign, User
from routes.auth import get_current_user

router = APIRouter(prefix="/leads", tags=["leads"])


@router.get("")
def list_leads(
    tab: str = Query("interested"),
    campaign_id: Optional[int] = Query(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    base = Call.is_demo == False  # noqa: E712
    if current_user.role != "superadmin":
        base = base & (Call.organization_id == current_user.organization_id)
    if campaign_id:
        base = base & (Call.campaign_id == campaign_id)

    if tab == "callback_requested":
        base = base & (Call.outcome == "callback_requested")
    elif tab == "appointment_scheduled":
        base = base & (Call.appointment_scheduled == True)  # noqa: E712
    else:
        base = base & (Call.outcome == "interested")

    calls = session.exec(
        select(Call).where(base).order_by(Call.started_at.desc()).limit(200)
    ).all()

    result = []
    for call in calls:
        prospect = session.get(Prospect, call.prospect_id) if call.prospect_id else None
        campaign = session.get(Campaign, call.campaign_id) if call.campaign_id else None
        result.append({
            "call_id": call.id,
            "prospect_id": call.prospect_id,
            "prospect_name": prospect.name if prospect else "—",
            "prospect_company": (prospect.company or "—") if prospect else "—",
            "prospect_phone": prospect.phone if prospect else "—",
            "campaign_id": call.campaign_id,
            "campaign_name": campaign.name if campaign else "—",
            "outcome": call.outcome,
            "started_at": call.started_at.isoformat() if call.started_at else None,
            "duration_seconds": call.duration_seconds,
            "notes": call.notes,
            "recording_url": call.recording_url,
            "appointment_date": call.appointment_date.isoformat() if call.appointment_date else None,
            "sentiment": call.sentiment,
        })
    return result
