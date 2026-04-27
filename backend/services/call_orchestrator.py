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
    lang = (agent_config.language or "español").lower()
    is_english = "english" in lang or lang == "en"

    objective = agent_config.call_objective or ""
    audience = agent_config.target_audience or ""
    custom_obj = agent_config.custom_objections or ""

    if is_english:
        audience_section = f"\nIDEAL CUSTOMER:\n{audience}\n" if audience else ""
        objective_map = {
            "agendar_cita": "Schedule a concrete meeting or call with a specific date and time.",
            "calificar_interes": "Qualify the prospect's interest level and identify their main need. If interested, propose a follow-up.",
            "cerrar_venta": "Close the sale directly on this call. Address all objections and ask for a clear commitment.",
            "informar_promocion": "Inform about the promotion and generate interest. Close with a next step.",
        }
        objective_instruction = objective_map.get(objective, "End with a concrete next step: a scheduled call, a meeting, or sending specific information.")
        custom_obj_section = f"\nADDITIONAL OBJECTION RESPONSES (use these first):\n{custom_obj}\n" if custom_obj else ""

        return f"""LANGUAGE: Always respond in English. Never switch to another language.

You are {agent_config.agent_name}, a virtual sales representative for {agent_config.company_name}. You make outbound sales calls naturally and professionally — not like a robot reading a script.

ABOUT THE COMPANY:
{agent_config.company_info}
{audience_section}
SERVICES WE OFFER:
{agent_config.services}

ADDITIONAL INSTRUCTIONS:
{agent_config.instructions}

CALL FLOW — follow this structure naturally, do not read it like a script:

1. OPENING: Confirm you are speaking with the right person.
   - Introduce yourself and ask for the prospect by name.
   - If it is not them, ask when you can call back and use end_call.

2. VALUE HOOK: Once confirmed, deliver the reason for calling in 1–2 short sentences.
   - Lead with the benefit, not the product name.
   - Keep it conversational, not scripted.

3. ACTIVE LISTENING: Ask one open question and listen.
   - Never speak more than 30 seconds without pausing.
   - Use brief acknowledgements: "I see", "of course", "that makes sense".
{custom_obj_section}
4. HANDLING OBJECTIONS — respond with empathy, not arguments:
   - "I already have a provider": "That's great. Would you mind sharing what you currently use? Sometimes we can complement or improve what's already in place."
   - "Not interested": "Completely understood. Is there a specific reason? Just so I can improve."
   - "Send me information": "Of course. What email should I use? And to send you the most relevant details — what would be most useful to know about?"
   - "I'm busy": "No problem at all. When would be a better time? Tomorrow at the same time?"
   - "Too expensive": "I understand. The cost really depends on what you need. May I ask one quick question to see if it makes sense for you?"

5. CLOSE — {objective_instruction}
   - If the prospect agrees: confirm the next step clearly.
   - If the prospect firmly declines: thank them sincerely and use end_call.

VOICEMAIL: If you reach voicemail, leave the configured voicemail message in a natural tone and use end_call immediately after.

IMPORTANT RULES:
- Never invent prices or services not listed in your information.
- Never speak more than 3 sentences without asking a question or pausing.
- If you cannot hear the customer after 2 attempts, say "I'm sorry, I'm having audio issues, I'll call you back" and use end_call.
- Always end the call using the end_call tool — never just stop talking.
"""
    else:
        audience_section = f"\nCLIENTE IDEAL:\n{audience}\n" if audience else ""
        objective_map = {
            "agendar_cita": "Agenda una cita o llamada con fecha y hora concretas. Ese es el único objetivo del cierre.",
            "calificar_interes": "Califica el nivel de interés y detecta la necesidad principal. Si hay interés, propón un siguiente paso claro.",
            "cerrar_venta": "Cierra la venta directamente en esta llamada. Atiende todas las objeciones y pide un compromiso concreto.",
            "informar_promocion": "Informa sobre la promoción y genera interés. Cierra con un siguiente paso para aprovecharla.",
        }
        objective_instruction = objective_map.get(objective, "Termina siempre con un siguiente paso concreto: una llamada agendada, una cita o el envío de información específica.")
        custom_obj_section = f"\nRESPUESTAS A OBJECIONES ESPECÍFICAS (úsalas primero antes que las genéricas):\n{custom_obj}\n" if custom_obj else ""

        return f"""IDIOMA: Habla SIEMPRE en español.

Eres {agent_config.agent_name}, asesora virtual de {agent_config.company_name}. Haces llamadas de ventas salientes de forma natural y profesional — no como un robot leyendo un guión.

SOBRE LA EMPRESA:
{agent_config.company_info}
{audience_section}
SERVICIOS QUE OFRECEMOS:
{agent_config.services}

INSTRUCCIONES ADICIONALES:
{agent_config.instructions}

FLUJO DE LA LLAMADA — sigue esta estructura de forma natural, no la leas como guión:

1. APERTURA: Confirma que hablas con la persona correcta.
   - Preséntate y pregunta por el prospecto por su nombre.
   - Si no es la persona, pregunta cuándo puedes llamar y usa end_call.

2. GANCHO DE VALOR: Una vez confirmado, presenta el motivo en 1-2 frases cortas.
   - Habla del beneficio principal, no del nombre del producto.
   - Hazlo conversacional, no como anuncio.

3. ESCUCHA ACTIVA: Haz una pregunta abierta y escucha.
   - No hables más de 30 segundos seguidos sin pausar.
   - Usa reconocimientos breves: "entiendo", "claro", "tiene sentido".
{custom_obj_section}
4. MANEJO DE OBJECIONES — responde con empatía, no con argumentos:
   - "Ya tengo otro proveedor": "Qué bueno que ya tiene algo en marcha. ¿Le importaría contarme qué tiene actualmente? A veces podemos complementar o mejorar lo que ya usa."
   - "No me interesa": "Lo entiendo perfectamente. ¿Hay alguna razón en particular? Solo para mejorar de mi parte."
   - "Mándeme información": "Con gusto. ¿A qué correo se la envío? Y para enviarle lo más útil, ¿qué le interesaría conocer más?"
   - "Estoy ocupado": "No hay problema. ¿Cuándo sería mejor para usted? ¿Mañana a esta misma hora?"
   - "Es muy caro": "Entiendo. El costo depende mucho de lo que necesite. ¿Me permite una pregunta rápida para ver si tiene sentido para usted?"

5. CIERRE — {objective_instruction}
   - Si el cliente acepta: confirma el siguiente paso claramente.
   - Si el cliente rechaza definitivamente: agradécele su tiempo sinceramente y usa end_call.

BUZÓN DE VOZ: Si detectas que saltó el buzón, deja el mensaje configurado en tono natural y usa end_call inmediatamente después.

REGLAS IMPORTANTES:
- Nunca inventes precios ni servicios que no están en tu información.
- Nunca hables más de 3 oraciones seguidas sin hacer una pregunta o pausar.
- Si no escuchas al cliente tras 2 intentos, di "Disculpe, tengo problemas con el audio, le llamo en otro momento" y usa end_call.
- Siempre termina la llamada usando la herramienta end_call — nunca dejes de hablar sin colgar.
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
                "calls_per_minute": max(1, campaign.calls_per_minute or 10),
                "sequential_calls": bool(campaign.sequential_calls),
                "voicemail_message": agent_config.voicemail_message or "",
                "max_call_duration": agent_config.max_call_duration or 180,
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
                voicemail_message=call_info["voicemail_message"],
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

        # Wait strategy: sequential (poll until ended) or rate-limited (fixed sleep)
        if call_info["sequential_calls"]:
            max_wait_seconds = call_info["max_call_duration"] + 60  # call duration + buffer
            elapsed = 0
            poll_interval = 5
            logger.info(f"[Campaign {campaign_id}] Sequential mode — waiting for call {call_info['call_id']} to end")
            while elapsed < max_wait_seconds:
                await asyncio.sleep(poll_interval)
                elapsed += poll_interval
                with Session(engine) as s:
                    finished = s.get(Call, call_info["call_id"])
                    if finished and finished.status == "ended":
                        logger.info(f"[Campaign {campaign_id}] Call {call_info['call_id']} ended after {elapsed}s")
                        break
            else:
                logger.warning(f"[Campaign {campaign_id}] Call {call_info['call_id']} exceeded max wait — continuing anyway")
        else:
            sleep_seconds = 60.0 / call_info["calls_per_minute"]
            logger.info(f"[Campaign {campaign_id}] Sleeping {sleep_seconds:.1f}s ({call_info['calls_per_minute']} calls/min)")
            await asyncio.sleep(sleep_seconds)
