from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from database import get_session
from models import Call, Campaign, Prospect, AgentConfig
from services import vapi_client
from services.call_orchestrator import build_system_prompt

router = APIRouter(prefix="/calls", tags=["calls"])


class DemoCallRequest(BaseModel):
    phone: str
    agent_id: int


@router.post("/demo")
async def demo_call(req: DemoCallRequest, session: Session = Depends(get_session)):
    agent = session.get(AgentConfig, req.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    # Find or create a persistent demo campaign for this agent
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
        )
        session.add(demo_campaign)
        session.commit()
        session.refresh(demo_campaign)

    # Create a temporary prospect for this demo call
    prospect = Prospect(
        campaign_id=demo_campaign.id,
        name="Demo",
        phone=req.phone,
        company="Demo",
    )
    session.add(prospect)
    session.commit()
    session.refresh(prospect)

    # Create the call record
    call = Call(
        prospect_id=prospect.id,
        campaign_id=demo_campaign.id,
        status="initiated",
        is_demo=True,
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        system_prompt = build_system_prompt(agent)
        result = await vapi_client.create_call(req.phone, system_prompt, agent)
        call.vapi_call_id = result.get("id", "")
        call.status = "in-progress"
        session.add(call)
        session.commit()
        return {"call_id": call.id, "vapi_call_id": call.vapi_call_id, "status": call.status}
    except Exception as e:
        call.status = "failed"
        session.add(call)
        session.commit()
        raise HTTPException(status_code=400, detail=str(e))


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
