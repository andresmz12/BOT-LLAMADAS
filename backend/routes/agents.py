import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import AgentConfig, Campaign, User, Organization
from routes.auth import get_current_user, require_write_access, require_superadmin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


class AgentCreate(BaseModel):
    name: str
    agent_name: str
    company_name: str
    company_info: str = ""
    services: str = ""
    instructions: str = ""
    language: str = "español"
    voice_id: Optional[str] = None
    max_call_duration: int = 180
    is_default: bool = False
    first_message_override: Optional[str] = None
    outbound_system_prompt: Optional[str] = None
    outbound_first_message: Optional[str] = None
    voicemail_message: Optional[str] = None
    temperature: float = 0.4
    inbound_enabled: bool = False
    inbound_system_prompt: Optional[str] = None
    inbound_first_message: Optional[str] = None


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
    outbound_system_prompt: Optional[str] = None
    outbound_first_message: Optional[str] = None
    voicemail_message: Optional[str] = None
    temperature: Optional[float] = None
    retell_agent_id: Optional[str] = None
    retell_llm_id: Optional[str] = None
    inbound_enabled: Optional[bool] = None
    inbound_system_prompt: Optional[str] = None
    inbound_first_message: Optional[str] = None
    inbound_retell_agent_id: Optional[str] = None
    inbound_retell_llm_id: Optional[str] = None


@router.post("")
def create_agent(
    data: AgentCreate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    org_id = None if current_user.role == "superadmin" else current_user.organization_id
    agent = AgentConfig(**data.dict(), organization_id=org_id)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent.dict(exclude={"campaigns"})


@router.get("")
def list_agents(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(AgentConfig)
    if current_user.role != "superadmin":
        query = query.where(AgentConfig.organization_id == current_user.organization_id)
    return [a.dict(exclude={"campaigns"}) for a in session.exec(query).all()]


@router.get("/{agent_id}")
def get_agent(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return agent.dict(exclude={"campaigns"})


@router.put("/{agent_id}")
def update_agent(
    agent_id: int,
    data: AgentUpdate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    logger.info(f"PUT /agents/{agent_id} — payload: {data.dict(exclude_none=True)}")
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    NON_NULLABLE = {'temperature', 'max_call_duration', 'is_default', 'language', 'name',
                    'agent_name', 'company_name', 'company_info', 'services', 'instructions',
                    'voice_id', 'inbound_enabled'}
    for field, value in data.dict(exclude_unset=True).items():
        if value is None and field in NON_NULLABLE:
            continue
        setattr(agent, field, value)
    session.add(agent)
    session.commit()
    session.refresh(agent)
    return agent.dict(exclude={"campaigns"})


@router.post("/{agent_id}/sync")
async def sync_agent(
    agent_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    from services import retell_client
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    # Load org credentials
    org = session.get(Organization, agent.organization_id) if agent.organization_id else None
    api_key = (org.retell_api_key if org else "") or ""
    phone_number = (org.retell_phone_number if org else "") or ""

    logger.info(f"POST /agents/{agent_id}/sync — Retell sync for '{agent.name}'")
    retell_error = None
    try:
        out_agent_id, out_llm_id, in_agent_id, in_llm_id = await retell_client.sync_to_retell(
            agent, api_key=api_key, phone_number=phone_number
        )
        agent.retell_agent_id = out_agent_id
        agent.retell_llm_id = out_llm_id
        agent.inbound_retell_agent_id = in_agent_id or None
        agent.inbound_retell_llm_id = in_llm_id or None
        session.add(agent)
        session.commit()
        session.refresh(agent)
        logger.info(f"POST /agents/{agent_id}/sync — OK out={out_agent_id} in={in_agent_id}")
    except Exception as e:
        retell_error = str(e)
        logger.error(f"POST /agents/{agent_id}/sync — error: {retell_error}")

    return {"agent": agent.dict(exclude={"campaigns"}), "retell_error": retell_error}


@router.delete("/{agent_id}")
def delete_agent(
    agent_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    campaigns = session.exec(select(Campaign).where(Campaign.agent_config_id == agent_id)).all()
    if campaigns:
        raise HTTPException(status_code=400, detail="Agent has associated campaigns")
    session.delete(agent)
    session.commit()
    return {"ok": True}


@router.post("/{agent_id}/upload-kb")
async def upload_knowledge_base(
    agent_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    from services import retell_client as rc

    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")

    org = session.get(Organization, agent.organization_id) if agent.organization_id else None
    api_key = (org.retell_api_key if org else "") or ""
    if not api_key:
        raise HTTPException(status_code=400, detail="API key de Retell no configurada en la organización")
    if not agent.retell_llm_id:
        raise HTTPException(status_code=400, detail="El agente no está sincronizado con Retell. Sincroniza primero.")

    # Validate file size (10 MB)
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="El archivo supera el límite de 10 MB")

    allowed_ext = {".pdf", ".txt", ".docx", ".doc", ".md", ".csv"}
    filename = file.filename or "document"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in allowed_ext:
        raise HTTPException(status_code=400, detail=f"Formato no permitido. Usa: PDF, TXT, DOCX, MD, CSV")

    kb_name = agent.name[:39]
    kb_id = await rc.create_knowledge_base(kb_name, content, filename, api_key)

    # Attach KB to outbound LLM
    await rc.attach_kb_to_llm(agent.retell_llm_id, kb_id, api_key)

    # Attach KB to inbound LLM if exists
    if agent.inbound_retell_llm_id:
        try:
            await rc.attach_kb_to_llm(agent.inbound_retell_llm_id, kb_id, api_key)
        except Exception as e:
            logger.warning(f"Could not attach KB to inbound LLM: {e}")

    agent.retell_knowledge_base_id = kb_id
    session.add(agent)
    session.commit()
    logger.info(f"[KB] Agent {agent_id}: created KB {kb_id} from file '{filename}'")
    return {"ok": True, "knowledge_base_id": kb_id, "filename": filename}


@router.post("/{agent_id}/set-default")
def set_default(
    agent_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    query = select(AgentConfig)
    if current_user.role != "superadmin":
        query = query.where(AgentConfig.organization_id == current_user.organization_id)
    for a in session.exec(query).all():
        a.is_default = a.id == agent_id
        session.add(a)
    session.commit()
    return {"ok": True}
