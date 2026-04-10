import asyncio
import logging
from datetime import datetime
from sqlmodel import Session, select
from models import Campaign, Prospect, Call, AgentConfig
from database import engine
from services import vapi_client

logger = logging.getLogger(__name__)

running_tasks: dict[int, asyncio.Task] = {}


def build_system_prompt(agent_config: AgentConfig) -> str:
    return f"""Eres {agent_config.agent_name}, asesora virtual de {agent_config.company_name}.

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
    logger.info(f"Starting campaign {campaign_id}")
    try:
        await _run_campaign_loop(campaign_id)
    except asyncio.CancelledError:
        logger.info(f"Campaign {campaign_id} loop cancelled")
    except Exception as e:
        logger.error(f"Campaign {campaign_id} error: {e}")
    finally:
        running_tasks.pop(campaign_id, None)
        with Session(engine) as session:
            campaign = session.get(Campaign, campaign_id)
            if campaign and campaign.status == "running":
                campaign.status = "completed"
                session.add(campaign)
                session.commit()


async def _run_campaign_loop(campaign_id: int):
    with Session(engine) as session:
        campaign = session.get(Campaign, campaign_id)
        if not campaign:
            return
        agent_config = session.get(AgentConfig, campaign.agent_config_id)
        if not agent_config:
            return
        system_prompt = build_system_prompt(agent_config)

    while True:
        with Session(engine) as session:
            campaign = session.get(Campaign, campaign_id)
            if not campaign or campaign.status != "running":
                break

            prospects = session.exec(
                select(Prospect).where(
                    Prospect.campaign_id == campaign_id,
                    Prospect.status == "pending",
                    Prospect.call_attempts < 3,
                )
            ).all()

            if not prospects:
                campaign.status = "completed"
                session.add(campaign)
                session.commit()
                break

            for prospect in prospects:
                session.refresh(campaign)
                if campaign.status != "running":
                    return

                prospect.status = "calling"
                prospect.call_attempts += 1
                prospect.last_called_at = datetime.utcnow()
                session.add(prospect)

                call = Call(
                    prospect_id=prospect.id,
                    campaign_id=campaign_id,
                    status="initiated",
                )
                session.add(call)
                session.commit()
                session.refresh(call)
                call_id = call.id
                prospect_phone = prospect.phone

        try:
            result = await vapi_client.create_call(prospect_phone, system_prompt, agent_config)
            vapi_call_id = result.get("id", "")
            with Session(engine) as session:
                call = session.get(Call, call_id)
                if call:
                    call.vapi_call_id = vapi_call_id
                    call.status = "in-progress"
                    session.add(call)
                    session.commit()
        except Exception as e:
            logger.error(f"Failed to create call for {prospect_phone}: {e}")
            with Session(engine) as session:
                call = session.get(Call, call_id)
                if call:
                    call.status = "failed"
                    call.outcome = "failed"
                    session.add(call)
                prospect_obj = session.get(Prospect, prospect.id)
                if prospect_obj:
                    prospect_obj.status = "failed"
                    session.add(prospect_obj)
                session.commit()

        await asyncio.sleep(30)
