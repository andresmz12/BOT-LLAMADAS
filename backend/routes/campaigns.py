import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from database import get_session
from models import Campaign, Prospect
from services import call_orchestrator

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("", response_model=Campaign)
def create_campaign(campaign: Campaign, session: Session = Depends(get_session)):
    campaign.status = "draft"
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return campaign


@router.get("")
def list_campaigns(session: Session = Depends(get_session)):
    campaigns = session.exec(select(Campaign)).all()
    result = []
    for c in campaigns:
        total = session.exec(select(Prospect).where(Prospect.campaign_id == c.id)).all()
        done = [p for p in total if p.status not in ("pending", "calling")]
        result.append({
            **c.dict(),
            "total_prospects": len(total),
            "completed_prospects": len(done),
        })
    return result


@router.get("/{campaign_id}")
def get_campaign(campaign_id: int, session: Session = Depends(get_session)):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.post("/{campaign_id}/start")
async def start_campaign(campaign_id: int, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status == "running":
        raise HTTPException(status_code=400, detail="Campaign already running")
    campaign.status = "running"
    session.add(campaign)
    session.commit()
    task = asyncio.create_task(call_orchestrator.start_campaign(campaign_id))
    call_orchestrator.running_tasks[campaign_id] = task
    return {"ok": True, "status": "running"}


@router.post("/{campaign_id}/pause")
def pause_campaign(campaign_id: int, session: Session = Depends(get_session)):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    campaign.status = "paused"
    session.add(campaign)
    session.commit()
    task = call_orchestrator.running_tasks.pop(campaign_id, None)
    if task:
        task.cancel()
    return {"ok": True, "status": "paused"}


@router.delete("/{campaign_id}")
def delete_campaign(campaign_id: int, session: Session = Depends(get_session)):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if campaign.status != "draft":
        raise HTTPException(status_code=400, detail="Only draft campaigns can be deleted")
    session.delete(campaign)
    session.commit()
    return {"ok": True}
