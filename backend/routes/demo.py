import httpx
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from database import get_session
from models import User, Organization, Call, AgentConfig
from routes.auth import get_current_user

router = APIRouter(prefix="/demo", tags=["demo"])
logger = logging.getLogger(__name__)
RETELL_API_URL = "https://api.retellai.com"
MAX_DEMO_CALLS = 10


@router.get("/status")
def demo_status(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id)
    used = (org.demo_calls_used or 0) if org else 0
    is_free = (org.plan if org else "free") == "free"
    return {
        "plan": org.plan if org else "free",
        "demo_calls_used": used,
        "demo_calls_remaining": max(0, MAX_DEMO_CALLS - used) if is_free else None,
        "limit_reached": is_free and used >= MAX_DEMO_CALLS,
    }


@router.post("/start-call")
async def start_demo_call(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")

    used = org.demo_calls_used or 0
    if org.plan == "free" and used >= MAX_DEMO_CALLS:
        raise HTTPException(
            status_code=403,
            detail="DEMO_LIMIT: Has usado todas tus llamadas demo. Contacta soporte para activar el plan Pro."
        )

    agent = session.exec(
        select(AgentConfig).where(AgentConfig.organization_id == current_user.organization_id)
    ).first()

    if not agent or not agent.retell_agent_id:
        raise HTTPException(
            status_code=400,
            detail="Primero crea y sincroniza un agente en la sección Agentes."
        )

    api_key = org.retell_api_key
    if not api_key:
        raise HTTPException(status_code=400, detail="Retell API key no configurada en Configuración.")

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{RETELL_API_URL}/v2/create-web-call",
            json={"agent_id": agent.retell_agent_id},
            headers=headers,
        )
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise HTTPException(status_code=502, detail=f"Retell error: {detail}")
        data = resp.json()

    call = Call(
        retell_call_id=data.get("call_id", ""),
        status="initiated",
        is_demo=True,
        organization_id=current_user.organization_id,
        started_at=datetime.utcnow(),
    )
    session.add(call)

    org.demo_calls_used = used + 1
    session.add(org)
    session.commit()

    new_used = org.demo_calls_used
    logger.info(f"[Demo] org={org.id} call started ({new_used}/{MAX_DEMO_CALLS})")
    return {
        "access_token": data["access_token"],
        "call_id": data.get("call_id"),
        "demo_calls_used": new_used,
        "demo_calls_remaining": max(0, MAX_DEMO_CALLS - new_used),
    }
