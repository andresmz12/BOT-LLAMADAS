from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from database import get_session
from models import Call, Campaign, Prospect, AgentConfig, User, Organization
from services import retell_client
from routes.auth import get_current_user, require_write_access

router = APIRouter(prefix="/calls", tags=["calls"])


class DemoCallRequest(BaseModel):
    phone: str
    agent_id: int


@router.post("/demo")
async def demo_call(
    req: DemoCallRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, req.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    api_key = (org.retell_api_key if org else "") or ""
    from_number = (org.retell_phone_number if org else "") or ""

    demo_campaign = session.exec(
        select(Campaign).where(
            (Campaign.name == "__demo__") & (Campaign.agent_config_id == agent.id)
        )
    ).first()
    if not demo_campaign:
        demo_campaign = Campaign(
            name="__demo__",
            description="Campaña de llamadas demo",
            status="draft",
            agent_config_id=agent.id,
            organization_id=current_user.organization_id,
        )
        session.add(demo_campaign)
        session.commit()
        session.refresh(demo_campaign)

    prospect = Prospect(
        campaign_id=demo_campaign.id,
        name="Demo",
        phone=req.phone,
        company="Demo",
        organization_id=current_user.organization_id,
    )
    session.add(prospect)
    session.commit()
    session.refresh(prospect)

    call = Call(
        prospect_id=prospect.id,
        campaign_id=demo_campaign.id,
        status="initiated",
        is_demo=True,
        organization_id=current_user.organization_id,
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        result = await retell_client.create_call(
            req.phone, agent,
            prospect_name="Demo",
            prospect_company="Demo",
            api_key=api_key,
            from_number=from_number,
        )
        call.retell_call_id = result.get("call_id", "")
        call.status = "in-progress"
        session.add(call)
        session.commit()
        return {"call_id": call.id, "retell_call_id": call.retell_call_id, "status": call.status}
    except Exception as e:
        call.status = "failed"
        session.add(call)
        session.commit()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_calls(
    campaign_id: int | None = None,
    outcome: str | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Call)
    if current_user.role != "superadmin":
        query = query.where(Call.organization_id == current_user.organization_id)
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
def get_call(
    call_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    call = session.get(Call, call_id)
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if current_user.role != "superadmin" and call.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    d = call.dict()
    if call.prospect:
        d["prospect_name"] = call.prospect.name
        d["prospect_company"] = call.prospect.company
        d["prospect_phone"] = call.prospect.phone
    return d
