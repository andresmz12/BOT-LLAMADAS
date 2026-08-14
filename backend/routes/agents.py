import os
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import AgentConfig, Campaign, User, Organization
from routes.auth import get_current_user, require_write_access, require_superadmin
from services.notification_emails import send_notification_email
from services.audit_log import log_action

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
    call_objective: Optional[str] = None
    target_audience: Optional[str] = None
    custom_objections: Optional[str] = None


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
    call_objective: Optional[str] = None
    target_audience: Optional[str] = None
    custom_objections: Optional[str] = None


def _compute_score(agent) -> tuple[int, list[str]]:
    score = 15  # name + agent_name + company_name are required so always present
    warnings = []
    info_len = len(agent.company_info or "")
    if info_len > 100:
        score += 15
    elif info_len > 20:
        score += 7
        warnings.append("Info de empresa muy corta — amplíala para darle más contexto al agente")
    else:
        warnings.append("Falta información de la empresa")

    svc_len = len(agent.services or "")
    if svc_len > 100:
        score += 15
    elif svc_len > 20:
        score += 7
        warnings.append("Descripción de servicios muy corta")
    else:
        warnings.append("Falta descripción de servicios")

    if agent.target_audience:
        score += 15
    else:
        warnings.append("Sin público objetivo — el agente no puede calificar prospectos durante la llamada")

    if agent.call_objective:
        score += 15
    else:
        warnings.append("Sin objetivo de llamada — el agente no sabe cuándo intentar cerrar")

    if agent.custom_objections:
        score += 10
    else:
        warnings.append("Sin objeciones personalizadas — el agente usará respuestas genéricas")

    if agent.voicemail_message:
        score += 5
    else:
        warnings.append("Sin mensaje de buzón de voz")

    if agent.outbound_first_message:
        score += 5

    return min(score, 100), warnings


@router.post("")
def create_agent(
    data: AgentCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    org_id = None if current_user.role == "superadmin" else current_user.organization_id
    agent = AgentConfig(**data.dict(), organization_id=org_id)
    session.add(agent)
    session.commit()
    session.refresh(agent)

    if org_id:
        org = session.get(Organization, org_id)
        background_tasks.add_task(
            send_notification_email,
            org=org,
            to_email=current_user.email,
            subject=f"Agente creado: {agent.agent_name}",
            greeting=f"Hola {current_user.full_name},",
            body=f"Creaste el agente \"{agent.agent_name}\" para {agent.company_name}. Sincronízalo con Retell para empezar a usarlo.",
        )
    log_action(session, current_user, "agent.create", details=f"{agent.agent_name} (id={agent.id})")
    return agent.dict(exclude={"campaigns"})


@router.get("")
def list_agents(
    organization_id: int | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(AgentConfig)
    if current_user.role != "superadmin":
        query = query.where(AgentConfig.organization_id == current_user.organization_id)
    elif organization_id is not None:
        query = query.where(AgentConfig.organization_id == organization_id)
    return [a.dict(exclude={"campaigns"}) for a in session.exec(query).all()]


class GenerateFromDescription(BaseModel):
    description: str


_GENERATE_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "agent_name": {"type": "string"},
        "company_name": {"type": "string"},
        "company_info": {"type": "string"},
        "services": {"type": "string"},
        "target_audience": {"type": "string"},
        "call_objective": {
            "type": "string",
            "enum": ["agendar_cita", "calificar_interes", "cerrar_venta", "informar_promocion"],
        },
        "custom_objections": {"type": "string"},
        "voicemail_message": {"type": "string"},
        "outbound_first_message": {"type": "string"},
        "language": {"type": "string", "enum": ["español", "english", "bilingüe"]},
    },
    "required": [
        "name", "agent_name", "company_name", "company_info", "services",
        "target_audience", "call_objective", "custom_objections",
        "voicemail_message", "outbound_first_message", "language",
    ],
    "additionalProperties": False,
}

_GENERATE_PROMPT = """Eres un experto en configurar agentes de voz IA para ventas telefónicas.
A partir de la descripción del negocio que da el usuario, completa la ficha de un agente de ventas.

Reglas:
- "name" es un identificador interno corto (ej. "ventas-limpieza-houston"), sin espacios ni acentos, en minúsculas con guiones.
- "agent_name" es el nombre de pila con el que el agente se presenta al hablar (ej. "Sofía", "Andrea").
- "company_info" e "services" deben ser específicos y accionables, no genéricos — inclúyelos como si fueran a usarse
  directamente en un guión de ventas real, con detalles concretos (usa lo que el usuario haya dado; si falta algo,
  infiere algo razonable para ese tipo de negocio, sin inventar precios exactos que no te dieron).
- "target_audience" describe el cliente ideal en una frase concreta (tipo de persona/negocio, tamaño, ubicación si aplica).
- "custom_objections" da 3-4 objeciones típicas de ESE negocio específico con su respuesta, en el formato:
  - "objeción": respuesta
- "voicemail_message" es un mensaje corto y natural para dejar en buzón de voz si nadie contesta.
- "outbound_first_message" es la primera frase que dice el agente al contestar la llamada, incluyendo {{customer_name}}
  para el nombre del prospecto, ej: "Hola, buenos días, ¿hablo con {{customer_name}}?"
- "call_objective" elige el más adecuado de: agendar_cita, calificar_interes, cerrar_venta, informar_promocion.
- "language" es "español" salvo que el usuario pida explícitamente inglés o un mercado bilingüe.
- Todo el texto en español salvo que el usuario pida inglés."""


@router.post("/generate")
async def generate_agent_from_description(
    data: GenerateFromDescription,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Fill the agent form from a plain-language description, so creating an
    agent doesn't require knowing what each of the ~15 fields is for."""
    if not (data.description or "").strip():
        raise HTTPException(status_code=400, detail="Describe el negocio primero")

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    api_key = ((org.anthropic_api_key if org else "") or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada.")

    from anthropic import AsyncAnthropic
    client = AsyncAnthropic(api_key=api_key)
    messages = [{"role": "user", "content": data.description.strip()}]

    async def _call(use_schema: bool):
        kwargs = {}
        if use_schema:
            kwargs["output_config"] = {"format": {"type": "json_schema", "schema": _GENERATE_SCHEMA}}
        message = await client.messages.create(
            model="claude-sonnet-5",
            max_tokens=1536,
            system=_GENERATE_PROMPT,
            messages=messages,
            **kwargs,
        )
        text = message.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.lstrip().lower().startswith("json"):
                text = text.lstrip()[4:]
        return json.loads(text.strip())

    try:
        try:
            return await _call(use_schema=True)
        except Exception as e:
            logger.warning(f"[Agents] generate: structured output failed ({type(e).__name__}: {e}); retrying plain")
            return await _call(use_schema=False)
    except Exception as e:
        logger.error(f"[Agents] generate failed: {e}", exc_info=True)
        from services.anthropic_errors import friendly_anthropic_error
        raise HTTPException(status_code=502, detail=friendly_anthropic_error(e))


@router.get("/voices")
async def list_voices(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Retell's live voice catalog, so the agent form isn't stuck on a
    hardcoded list that predates newer, more natural voices."""
    from services import retell_client

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    api_key = ((org.retell_api_key if org else "") or "").strip()
    try:
        return await retell_client.list_voices(api_key=api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"[Agents] list_voices failed: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="No se pudo obtener el catálogo de voces de Retell")


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


@router.get("/{agent_id}/prompt-preview")
def prompt_preview(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    from services.call_orchestrator import build_system_prompt
    prompt = agent.outbound_system_prompt or build_system_prompt(agent)
    score, warnings = _compute_score(agent)
    return {"prompt": prompt, "score": score, "warnings": warnings}


@router.put("/{agent_id}")
def update_agent(
    agent_id: int,
    data: AgentUpdate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    logger.info(f"PUT /agents/{agent_id}")
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
    log_action(session, current_user, "agent.update", details=f"{agent.agent_name} (id={agent.id})")
    return agent.dict(exclude={"campaigns"})


@router.post("/{agent_id}/sync")
async def sync_agent(
    agent_id: int,
    background_tasks: BackgroundTasks,
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
        if org:
            background_tasks.add_task(
                send_notification_email,
                org=org,
                to_email=current_user.email,
                subject=f"Agente sincronizado: {agent.agent_name}",
                greeting=f"Hola {current_user.full_name},",
                body=f"El agente \"{agent.agent_name}\" quedó sincronizado con Retell y ya puede recibir/hacer llamadas.",
            )
        log_action(session, current_user, "agent.sync", details=f"{agent.agent_name} (id={agent.id})")
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
    agent_name = agent.agent_name
    session.delete(agent)
    session.commit()
    log_action(session, current_user, "agent.delete", details=f"{agent_name} (id={agent_id})")
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
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    query = select(AgentConfig)
    if current_user.role != "superadmin":
        query = query.where(AgentConfig.organization_id == current_user.organization_id)
    for a in session.exec(query).all():
        a.is_default = a.id == agent_id
        session.add(a)
    session.commit()
    return {"ok": True}
