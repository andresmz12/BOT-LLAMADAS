import asyncio
import logging
import os
from datetime import datetime
from sqlmodel import Session, select
from models import Campaign, Prospect, Call, AgentConfig, Organization
from database import engine
from services import retell_client

logger = logging.getLogger(__name__)

running_tasks: dict[int, asyncio.Task] = {}


def build_system_prompt(agent_config: AgentConfig) -> str:
    return f"""IDIOMA: Habla SIEMPRE en español. Never respond in English under any circumstances.

Eres {agent_config.agent_name}, asesora virtual de {agent_config.company_name}.

SOBRE LA EMPRESA:
{agent_config.company_info}

SERVICIOS QUE OFRECEMOS:
{agent_config.services}

INSTRUCCIONES DE COMPORTAMIENTO:
{agent_config.instructions}

REGLAS IMPORTANTES:
- Nunca inventes precios ni servicios que no están en tu información
- Si no contestan, deja un mensaje de voz breve y amable
- Al finalizar la llamada, despídete cordialmente
"""


async def start_campaign(campaign_id: int):
    logger.info(f"[Campaign {campaign_id}] Starting")
    try:
        await _run_campaign_loop(campaign_id)
    except asyncio.CancelledError:
        logger.info(f"[Campaign {campaign_id}] Cancelled")
    except Exception as e:
        logger.error(f"[Campaign {campaign_id}] Unhandled error: {e}", exc_info=True)
    finally:
        running_tasks.pop(campaign_id, None)
        with Session(engine) as session:
            campaign = session.get(Campaign, campaign_id)
            if campaign and campaign.status == "running":
                campaign.status = "completed"
                session.add(campaign)
                session.commit()
                logger.info(f"[Campaign {campaign_id}] Marked completed in finally block")


async def _run_campaign_loop(campaign_id: int):
    """Process ONE prospect per iteration to avoid race conditions."""
    while True:
        call_info = None

        with Session(engine) as session:
            campaign = session.get(Campaign, campaign_id)
            if not campaign:
                logger.error(f"[Campaign {campaign_id}] Not found in DB")
                break
            if campaign.status != "running":
                logger.info(f"[Campaign {campaign_id}] Status={campaign.status}, stopping loop")
                break

            agent_config = session.get(AgentConfig, campaign.agent_config_id)
            if not agent_config:
                logger.error(f"[Campaign {campaign_id}] AgentConfig {campaign.agent_config_id} not found")
                break

            # Validate agent is synced before doing anything
            if not agent_config.retell_agent_id:
                logger.error(
                    f"[Campaign {campaign_id}] Agent '{agent_config.name}' has no retell_agent_id. "
                    "Go to Agents → Sync before starting a campaign."
                )
                campaign.status = "paused"
                session.add(campaign)
                session.commit()
                break

            # Load org credentials
            org = session.get(Organization, campaign.organization_id) if campaign.organization_id else None
            api_key = (org.retell_api_key if org else "") or os.getenv("RETELL_API_KEY", "")
            from_number = (org.retell_phone_number if org else "") or os.getenv("RETELL_PHONE_NUMBER", "")

            if not api_key or not from_number:
                logger.error(
                    f"[Campaign {campaign_id}] Missing credentials: "
                    f"api_key={'ok' if api_key else 'MISSING'} from_number={'ok' if from_number else 'MISSING'}"
                )
                campaign.status = "paused"
                session.add(campaign)
                session.commit()
                break

            # Get ONE pending prospect
            prospect = session.exec(
                select(Prospect).where(
                    Prospect.campaign_id == campaign_id,
                    Prospect.status == "pending",
                    Prospect.call_attempts < 3,
                )
            ).first()

            if not prospect:
                campaign.status = "completed"
                session.add(campaign)
                session.commit()
                logger.info(f"[Campaign {campaign_id}] No more pending prospects — completed")
                break

            # Mark prospect as calling
            prospect.status = "calling"
            prospect.call_attempts += 1
            prospect.last_called_at = datetime.utcnow()
            session.add(prospect)

            # Create call record
            call = Call(
                prospect_id=prospect.id,
                campaign_id=campaign_id,
                status="initiated",
                organization_id=campaign.organization_id,
            )
            session.add(call)
            session.commit()
            session.refresh(call)

            # Copy all values out as plain Python before session closes
            call_info = {
                "call_id": call.id,
                "prospect_id": prospect.id,
                "phone": prospect.phone,
                "name": prospect.name,
                "company": prospect.company or "",
                "api_key": api_key,
                "from_number": from_number,
                "retell_agent_id": agent_config.retell_agent_id,
                "agent_name": agent_config.name,
                "voice_id": agent_config.voice_id or "retell-Andrea",
            }
            logger.info(
                f"[Campaign {campaign_id}] Dialing {prospect.phone} "
                f"(call_id={call.id}, attempt={prospect.call_attempts})"
            )

        # ── Make the Retell call OUTSIDE the session ───────────────────────────
        if not call_info:
            break

        try:
            result = await retell_client.create_call_direct(
                phone=call_info["phone"],
                retell_agent_id=call_info["retell_agent_id"],
                agent_name=call_info["agent_name"],
                voice_id=call_info["voice_id"],
                prospect_name=call_info["name"],
                prospect_company=call_info["company"],
                api_key=call_info["api_key"],
                from_number=call_info["from_number"],
            )
            retell_call_id = result.get("call_id", "")
            logger.info(
                f"[Campaign {campaign_id}] Retell call created: "
                f"retell_call_id={retell_call_id} for prospect {call_info['phone']}"
            )

            with Session(engine) as session:
                call = session.get(Call, call_info["call_id"])
                if call:
                    call.retell_call_id = retell_call_id
                    call.status = "in-progress"
                    session.add(call)
                    session.commit()

        except Exception as e:
            logger.error(
                f"[Campaign {campaign_id}] Failed to call {call_info['phone']}: {e}",
                exc_info=True
            )
            with Session(engine) as session:
                call = session.get(Call, call_info["call_id"])
                if call:
                    call.status = "failed"
                    call.outcome = "failed"
                    call.notes = str(e)[:500]
                    session.add(call)
                prospect_obj = session.get(Prospect, call_info["prospect_id"])
                if prospect_obj:
                    prospect_obj.status = "failed"
                    session.add(prospect_obj)
                session.commit()

        # Wait between calls to avoid rate limiting
        await asyncio.sleep(30)
