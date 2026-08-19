import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete
from sqlmodel import Session, select

from database import get_session
from models import LeadHunt, Organization, User
from routes.auth import get_current_user, require_write_access, require_pro_plan

router = APIRouter(prefix="/lead-hunter", tags=["lead-hunter"])
logger = logging.getLogger(__name__)


# ── Request schemas ────────────────────────────────────────────────────────────

class ScoutRequest(BaseModel):
    limit: int = 17


class LHConfigRequest(BaseModel):
    lh_target_description: Optional[str] = None
    lh_offer_description: Optional[str] = None
    lh_cities: Optional[str] = None
    lh_language: Optional[str] = "es"
    lh_channel: Optional[str] = "whatsapp"
    lh_active: bool = False


class LeadPatchRequest(BaseModel):
    reply: Optional[str] = None
    reply_intent: Optional[str] = None   # positivo | negativo | pregunta
    is_hot: Optional[bool] = None
    channel: Optional[str] = None


class SendRequest(BaseModel):
    channel: str = "whatsapp"


class FindEmailRequest(BaseModel):
    name: str
    city: Optional[str] = None


# ── Helpers ────────────────────────────────────────────────────────────────────

def _lead_dict(lead: LeadHunt) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "city": lead.city,
        "category": lead.category,
        "reviews_count": lead.reviews_count,
        "has_website": lead.has_website,
        "website_url": lead.website_url,
        "email": lead.email,
        "email_source": lead.email_source,
        "rating": lead.rating,
        "pain_point": lead.pain_point,
        "message_es": lead.message_es,
        "message_en": lead.message_en,
        "channel": lead.channel,
        "passed_checks": lead.passed_checks,
        "check_reason": lead.check_reason,
        "sent": lead.sent,
        "sent_at": lead.sent_at.isoformat() if lead.sent_at else None,
        "reply": lead.reply,
        "reply_intent": lead.reply_intent,
        "is_hot": lead.is_hot,
        "created_at": lead.created_at.isoformat() if lead.created_at else None,
    }


def _config_dict(org: Organization) -> dict:
    return {
        "lh_target_description": org.lh_target_description,
        "lh_offer_description": org.lh_offer_description,
        "lh_cities": org.lh_cities,
        "lh_language": org.lh_language or "es",
        "lh_channel": org.lh_channel or "whatsapp",
        "lh_active": org.lh_active,
    }


def _get_org(user: User, session: Session) -> Organization:
    if not user.organization_id:
        raise HTTPException(status_code=400, detail="Usuario sin organización")
    org = session.get(Organization, user.organization_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    return org


def _get_lead(lead_id: int, user: User, session: Session) -> LeadHunt:
    lead = session.get(LeadHunt, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead no encontrado")
    if user.role != "superadmin" and lead.org_id != user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    return lead


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/config")
def get_lh_config(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """Get Lead Hunter config for the current org."""
    org = _get_org(current_user, session)
    return _config_dict(org)


@router.post("/config")
def save_lh_config(
    data: LHConfigRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Save Lead Hunter config for the current org."""
    org = _get_org(current_user, session)
    org.lh_target_description = (data.lh_target_description or "").strip() or None
    org.lh_offer_description = (data.lh_offer_description or "").strip() or None
    org.lh_cities = (data.lh_cities or "").strip() or None
    org.lh_language = data.lh_language or "es"
    org.lh_channel = data.lh_channel or "whatsapp"
    org.lh_active = data.lh_active
    session.add(org)
    session.commit()
    session.refresh(org)
    return _config_dict(org)


@router.post("/scout")
def scout_leads(
    data: ScoutRequest,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    """Search Google Maps via Google Places and store matching businesses as LeadHunt records."""
    if not (1 <= data.limit <= 50):
        raise HTTPException(status_code=400, detail="El límite debe estar entre 1 y 50")

    from services.lead_hunter_service import scout
    try:
        leads = scout(
            limit=data.limit,
            org_id=current_user.organization_id,
            session=session,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"found": len(leads), "leads": [_lead_dict(l) for l in leads]}


@router.get("/leads")
def list_leads(
    filter: Optional[str] = None,   # all | checked | crafted | sent | hot
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    """List all LeadHunt records for the org, newest first."""
    query = select(LeadHunt)
    if current_user.role != "superadmin":
        query = query.where(LeadHunt.org_id == current_user.organization_id)

    if filter == "checked":
        query = query.where(LeadHunt.passed_checks == True)   # noqa: E712
    elif filter == "crafted":
        query = query.where(LeadHunt.message_es.is_not(None), LeadHunt.message_es != "")
    elif filter == "sent":
        query = query.where(LeadHunt.sent == True)             # noqa: E712
    elif filter == "hot":
        query = query.where(LeadHunt.is_hot == True)           # noqa: E712

    leads = session.exec(query.order_by(LeadHunt.created_at.desc())).all()
    return [_lead_dict(l) for l in leads]


@router.post("/leads/{lead_id}/check")
def check_lead(
    lead_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Run quality checker on a single lead."""
    lead = _get_lead(lead_id, current_user, session)
    from services.lead_hunter_service import checker
    checker([lead], session=session)
    return _lead_dict(lead)


@router.post("/check-all")
def check_all_leads(
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Run quality checker on all unchecked leads for the org."""
    query = select(LeadHunt).where(
        LeadHunt.org_id == current_user.organization_id,
        LeadHunt.passed_checks == None,   # noqa: E711
    )
    leads = session.exec(query).all()
    if not leads:
        return {"checked": 0}
    from services.lead_hunter_service import checker
    checker(leads, session=session)
    passed = sum(1 for l in leads if l.passed_checks)
    return {"checked": len(leads), "passed": passed, "failed": len(leads) - passed}


@router.post("/leads/{lead_id}/craft")
async def craft_lead_message(
    lead_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Generate pain_point + message_es + message_en for a lead using Claude."""
    lead = _get_lead(lead_id, current_user, session)
    org = _get_org(current_user, session)
    from services.lead_hunter_service import craft_messages
    try:
        lead = await craft_messages(lead, org, session=session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        from services.anthropic_errors import friendly_anthropic_error
        raise HTTPException(status_code=502, detail=friendly_anthropic_error(e))
    return _lead_dict(lead)


@router.post("/find-email")
async def find_email_by_name(
    data: FindEmailRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Look up a business by name (+ optional city) and try to find its
    email: a real address published on its own site first, or — if the
    domain can receive mail but publishes nothing — a generic guessed
    address clearly marked as unverified. Not tied to an existing lead."""
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Falta el nombre de la empresa")
    org = _get_org(current_user, session)
    from services.email_finder import find_company_email
    from services.google_places_service import GooglePlacesError
    try:
        result = await find_company_email(data.name.strip(), (data.city or "").strip(), org)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GooglePlacesError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"[LeadHunter] find-email failed for '{data.name}': {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="No se pudo buscar el correo. Intenta de nuevo.")
    return result


@router.post("/leads/{lead_id}/find-email")
async def find_email_for_lead(
    lead_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Same lookup as /find-email, but reuses the lead's own name/city/
    website (skipping the Google Places search if we already have its site)
    and saves the result onto the lead."""
    lead = _get_lead(lead_id, current_user, session)
    org = _get_org(current_user, session)
    from services.email_finder import find_company_email
    from services.google_places_service import GooglePlacesError
    try:
        result = await find_company_email(lead.name, lead.city, org, website_url=lead.website_url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except GooglePlacesError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        logger.error(f"[LeadHunter] find-email failed for lead={lead_id}: {e}", exc_info=True)
        raise HTTPException(status_code=502, detail="No se pudo buscar el correo. Intenta de nuevo.")

    if result.get("email"):
        lead.email = result["email"]
        lead.email_source = result["source"]
        if not lead.website_url and result.get("website"):
            lead.website_url = result["website"]
            lead.has_website = True
        session.add(lead)
        session.commit()
        session.refresh(lead)

    return {**result, "lead": _lead_dict(lead)}


@router.post("/craft-all")
async def craft_all_leads(
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Generate messages for all checked+passed leads that don't have messages yet."""
    org = _get_org(current_user, session)
    query = select(LeadHunt).where(
        LeadHunt.org_id == current_user.organization_id,
        LeadHunt.passed_checks == True,   # noqa: E712
        LeadHunt.message_es == None,      # noqa: E711
    )
    leads = session.exec(query).all()
    if not leads:
        return {"crafted": 0}

    # Cap at 8 per request to stay well under Railway's 30s timeout
    total_pending = len(leads)
    leads = leads[:8]

    from services.lead_hunter_service import craft_messages
    import asyncio
    crafted = 0
    errors = 0
    for lead in leads:
        try:
            await craft_messages(lead, org, session=session)
            crafted += 1
            await asyncio.sleep(0.3)
        except Exception as e:
            logger.warning(f"[LeadHunter] craft-all lead={lead.id} error: {e}")
            errors += 1
    return {"crafted": crafted, "errors": errors, "remaining": total_pending - crafted}


@router.post("/leads/{lead_id}/send")
async def send_lead_message(
    lead_id: int,
    data: SendRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Dispatch the outreach message via the specified channel."""
    lead = _get_lead(lead_id, current_user, session)
    if lead.sent:
        raise HTTPException(status_code=400, detail="Este lead ya fue enviado anteriormente")
    org = _get_org(current_user, session)
    from services.lead_hunter_service import dispatch
    try:
        lead = await dispatch(lead, org, channel=data.channel, session=session)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error al enviar: {str(e)[:200]}")
    return _lead_dict(lead)


@router.patch("/leads/{lead_id}")
def update_lead(
    lead_id: int,
    data: LeadPatchRequest,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Update reply, reply_intent, is_hot, or channel on a lead."""
    lead = _get_lead(lead_id, current_user, session)
    for field, value in data.dict(exclude_unset=True).items():
        setattr(lead, field, value)
    session.add(lead)
    session.commit()
    session.refresh(lead)
    return _lead_dict(lead)


@router.delete("/leads/{lead_id}")
def delete_lead(
    lead_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    lead = _get_lead(lead_id, current_user, session)
    session.delete(lead)
    session.commit()
    return {"ok": True}


@router.delete("/leads")
def delete_all_leads(
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Delete all Lead Hunter records for the org."""
    result = session.execute(
        sa_delete(LeadHunt).where(LeadHunt.org_id == current_user.organization_id)
    )
    session.commit()
    return {"deleted": result.rowcount}
