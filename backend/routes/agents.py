import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import AgentConfig, Campaign

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    agent_name: Optional[str] = None
    company_name: Optional[str] = None
    company_info: Optional[str] = None
    services: Optional[str] = None
    instructions: Optional[str] = None
    language: Optional[str] = None
    voice_id: Optional[str] = None
    max_call_duration: Optional[int] = None
    is_default: Optional[bool] = None
    first_message_override: Optional[str] = None
    voicemail_message: Optional[str] = None
    temperature: Optional[float] = None


@router.post("", response_model=AgentConfig)
def create_agent(agent: AgentConfig, session: Session = Depends(get_session)):
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.get("", response_model=list[AgentConfig])
def list_agents(session: Session = Depends(get_session)):
    return session.exec(select(AgentConfig)).all()


@router.get("/{agent_id}", response_model=AgentConfig)
def get_agent(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentConfig)
def update_agent(agent_id: int, data: AgentUpdate, session: Session = Depends(get_session)):
    logger.info(f"PUT /agents/{agent_id} — payload: {data.dict(exclude_none=True)}")
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in data.dict(exclude_unset=True).items():
        logger.info(f"  setting {field} = {repr(value)}")
        setattr(agent, field, value)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    logger.info(f"PUT /agents/{agent_id} — saved OK")
    return agent


@router.post("/{agent_id}/sync")
async def sync_agent(agent_id: int, session: Session = Depends(get_session)):
    from services import vapi_client
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    logger.info(f"POST /agents/{agent_id}/sync — starting VAPI sync for '{agent.name}'")
    vapi_error = None
    try:
        assistant_id = await vapi_client.sync_to_vapi(agent)
        agent.vapi_assistant_id = assistant_id
        session.add(agent)
        session.commit()
        session.refresh(agent)
        logger.info(f"POST /agents/{agent_id}/sync — VAPI assistant ID: {assistant_id}")
    except Exception as e:
        vapi_error = str(e)
        logger.error(f"POST /agents/{agent_id}/sync — VAPI error: {vapi_error}")

    return {"agent": agent, "vapi_error": vapi_error}


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    campaigns = session.exec(select(Campaign).where(Campaign.agent_config_id == agent_id)).first()
    if campaigns:
        raise HTTPException(status_code=400, detail="Agent has associated campaigns")
    session.delete(agent)
    session.commit()
    return {"ok": True}


@router.post("/{agent_id}/set-default")
def set_default(agent_id: int, session: Session = Depends(get_session)):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for a in session.exec(select(AgentConfig)).all():
        a.is_default = a.id == agent_id
        session.add(a)
    session.commit()
    return {"ok": True}
