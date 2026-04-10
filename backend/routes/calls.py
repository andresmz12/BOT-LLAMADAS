from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import Call

router = APIRouter(prefix="/calls", tags=["calls"])


@router.get("")
def list_calls(
    campaign_id: int | None = None,
    outcome: str | None = None,
    session: Session = Depends(get_session),
):
    query = select(Call)
    if campaign_id:
        query = query.where(Call.campaign_id == campaign_id)
    if outcome:
        query = query.where(Call.outcome == outcome)
    calls = session.exec(query.order_by(Call.started_at.desc())).all()
    result = []
    for call in calls:
        d = call.dict()
        if call.prospect:
            d["prospect_name"] = call.prospect.name
            d["prospect_company"] = call.prospect.company
            d["prospect_phone"] = call.prospect.phone
        result.append(d)
    return result


@router.get("/{call_id}")
def get_call(call_id: int, session: Session = Depends(get_session)):
    call = session.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    d = call.dict()
    if call.prospect:
        d["prospect_name"] = call.prospect.name
        d["prospect_company"] = call.prospect.company
        d["prospect_phone"] = call.prospect.phone
    return d
