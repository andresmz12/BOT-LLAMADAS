import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from pydantic import BaseModel, Field
from typing import Optional
from database import get_session
from models import Campaign, Prospect, User
from services import call_orchestrator
from routes.auth import get_current_user, require_write_access, require_pro_plan

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


class CampaignCreate(BaseModel):
    name: str
    description: Optional[str] = None
    agent_config_id: int
    calls_per_minute: int = Field(default=10, ge=1, le=100)
    sequential_calls: bool = False
    scheduled_start_at: Optional[datetime] = None


@router.post("")
def create_campaign(
    data: CampaignCreate,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    now_utc = datetime.now(timezone.utc)
    sched = data.scheduled_start_at
    if sched and sched.tzinfo is None:
        sched = sched.replace(tzinfo=timezone.utc)
    status = "scheduled" if sched and sched > now_utc else "draft"
    campaign = Campaign(
        name=data.name,
        description=data.description,
        agent_config_id=data.agent_config_id,
        calls_per_minute=data.calls_per_minute,
        sequential_calls=data.sequential_calls,
        scheduled_start_at=data.scheduled_start_at,
        status=status,
        organization_id=current_user.organization_id if current_user.role != "superadmin" else None,
    )
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
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    campaign = session.get(Campaign, campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found")
    if current_user.role != "superadmin" and campaign.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if campaign.status == "running":
        raise HTTPException(status_code=400, detail="Campaign already running")
    if campaign.status == "completed":
        raise HTTPException(status_code=400, detail="Campaign already completed")
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
    # Delete associated prospects first to avoid FK constraint issues
    for p in session.exec(select(Prospect).where(Prospect.campaign_id == campaign_id)).all():
        session.delete(p)
    session.delete(campaign)
    session.commit()
    return {"ok": True}
