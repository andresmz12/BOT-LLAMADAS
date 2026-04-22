import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from database import get_session
from models import Campaign, Prospect, User
from services import call_orchestrator
from routes.auth import get_current_user, require_write_access

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.post("")
def create_campaign(
    campaign: Campaign,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    campaign.status = "draft"
    if current_user.role != "superadmin":
        campaign.organization_id = current_user.organization_id
    session.add(campaign)
    session.commit()
    session.refresh(campaign)
    return campaign


@router.get("")
def list_campaigns(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Campaign)
    if current_user.role != "superadmin":
        query = query.where(Campaign.organization_id == current_user.organization_id)
    campaigns = session.exec(query).all()
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
def get_campaign(
    campaign_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return campaign


@router.post("/{campaign_id}/start")
async def start_campaign(
    campaign_id: int,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if campaign.status == "running":
        raise HTTPException(status_code=400, detail="Campaign already running")
    campaign.status = "running"
    session.add(campaign)
    session.commit()
    task = asyncio.create_task(call_orchestrator.start_campaign(campaign_id))
    call_orchestrator.running_tasks[campaign_id] = task
    return {"ok": True, "status": "running"}


@router.post("/{campaign_id}/pause")
def pause_campaign(
    campaign_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    campaign.status = "paused"
    session.add(campaign)
    session.commit()
    task = call_orchestrator.running_tasks.pop(campaign_id, None)
    if task:
        task.cancel()
    return {"ok": True, "status": "paused"}


@router.delete("/{campaign_id}")
def delete_campaign(
    campaign_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    # Stop if running
    task = call_orchestrator.running_tasks.pop(campaign_id, None)
    if task:
        task.cancel()
    session.delete(campaign)
    session.commit()
    return {"ok": True}
