import logging
import json
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

logger = logging.getLogger(__name__)
from sqlmodel import Session, select, func
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field as PydanticField
from database import get_session
from models import Call, Campaign, Prospect, AgentConfig, User, Organization
from services import retell_client
from routes.auth import get_current_user, require_write_access

router = APIRouter(prefix="/calls", tags=["calls"])


class DemoCallRequest(BaseModel):
    phone: str
    agent_id: int
    prospect_name: str = PydanticField(default="Demo", max_length=200)
    prospect_company: str = PydanticField(default="Demo", max_length=200)
    custom_context: Optional[dict] = None


@router.post("/demo")
async def demo_call(
    req: DemoCallRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    agent = session.get(AgentConfig, req.agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")
    if current_user.role != "superadmin" and agent.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Agente no encontrado")

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

    # Serialize custom_context dict → JSON string
    custom_context_str = None
    if req.custom_context:
        try:
            custom_context_str = json.dumps(req.custom_context)
        except (TypeError, ValueError) as e:
            raise HTTPException(status_code=422, detail=f"custom_context debe ser JSON válido: {e}")
        if len(custom_context_str) > 10_000:
            raise HTTPException(status_code=422, detail="custom_context demasiado grande (máx. 10 KB)")

    prospect = Prospect(
        campaign_id=demo_campaign.id,
        name=req.prospect_name,
        phone=req.phone,
        company=req.prospect_company,
        custom_context=custom_context_str,
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
    if org:
        org.demo_calls_used = (org.demo_calls_used or 0) + 1
        session.add(org)
    session.commit()
    session.refresh(call)

    try:
        result = await retell_client.create_call(
            req.phone, agent,
            prospect_name=req.prospect_name,
            prospect_company=req.prospect_company,
            prospect_custom_context=custom_context_str,
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
        logger.error(f"[demo_call] FAILED phone={req.phone} agent_id={req.agent_id} error={str(e)}")
        raise HTTPException(status_code=400, detail=str(e))


@router.get("")
def list_calls(
    campaign_id: int | None = None,
    outcome: str | None = None,
    prospect_id: int | None = None,
    organization_id: int | None = None,
    limit: int = 200,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Call).options(selectinload(Call.prospect))
    if current_user.role != "superadmin":
        query = query.where(Call.organization_id == current_user.organization_id)
    elif organization_id is not None:
        query = query.where(Call.organization_id == organization_id)
    if campaign_id:
        query = query.where(Call.campaign_id == campaign_id)
    if outcome:
        query = query.where(Call.outcome == outcome)
    if prospect_id:
        query = query.where(Call.prospect_id == prospect_id)
    calls = session.exec(
        query.order_by(Call.started_at.desc()).offset(offset).limit(min(limit, 500))
    ).all()
    result = []
    for call in calls:
        d = call.dict(exclude={"prospect", "campaign"})
        if call.prospect:
            d["prospect_name"] = call.prospect.name
            d["prospect_company"] = call.prospect.company
            d["prospect_phone"] = call.prospect.phone
        result.append(d)
    return result


@router.delete("")
def delete_calls(
    campaign_id: int | None = None,
    outcome: str | None = None,
    ids: str | None = None,  # comma-separated call IDs
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    from sqlalchemy import delete as _sql_delete

    # Build ID-only query to avoid loading full Call rows (raw_transcript can be large)
    id_query = select(Call.id)
    if current_user.role != "superadmin":
        id_query = id_query.where(Call.organization_id == current_user.organization_id)
    if ids:
        parsed_ids = [int(i) for i in ids.split(",") if i.strip().isdigit()]
        id_query = id_query.where(Call.id.in_(parsed_ids))
    else:
        if campaign_id:
            id_query = id_query.where(Call.campaign_id == campaign_id)
        if outcome:
            id_query = id_query.where(Call.outcome == outcome)

    ids_to_delete = session.exec(id_query).all()
    if ids_to_delete:
        session.exec(_sql_delete(Call).where(Call.id.in_(ids_to_delete)))  # type: ignore[arg-type]
        session.commit()
    return {"deleted": len(ids_to_delete)}


@router.get("/{call_id}")
def get_call(
    call_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Call).options(selectinload(Call.prospect)).where(Call.id == call_id)
    call = session.exec(query).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    if current_user.role != "superadmin" and call.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    d = call.dict(exclude={"prospect", "campaign"})
    if call.prospect:
        d["prospect_name"] = call.prospect.name
        d["prospect_company"] = call.prospect.company
        d["prospect_phone"] = call.prospect.phone
    return d
