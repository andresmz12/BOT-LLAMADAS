from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import AgentConfig, Campaign

router = APIRouter(prefix="/agents", tags=["agents"])


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
def update_agent(agent_id: int, data: AgentConfig, session: Session = Depends(get_session)):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in data.dict(exclude_unset=True, exclude={"id"}).items():
        setattr(agent, field, value)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent


@router.post("/{agent_id}/sync", response_model=AgentConfig)
async def sync_agent(agent_id: int, session: Session = Depends(get_session)):
    from services import vapi_client
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        assistant_id = await vapi_client.sync_to_vapi(agent)
        agent.vapi_assistant_id = assistant_id
        session.add(agent)
        session.commit()
        session.refresh(agent)
        return agent
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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
