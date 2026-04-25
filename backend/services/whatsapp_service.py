import os
import logging
import httpx
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)
META_API_URL = "https://graph.facebook.com/v19.0"


async def send_text_message(phone_number_id: str, access_token: str, to: str, text: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{META_API_URL}/{phone_number_id}/messages",
            headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            json={
                "messaging_product": "whatsapp",
                "to": to,
                "type": "text",
                "text": {"body": text},
            },
        )
        if resp.status_code >= 400:
            logger.error(f"[WhatsApp] Meta API error {resp.status_code}: {resp.text}")
            resp.raise_for_status()
        return resp.json()


async def generate_reply(org, conversation_history: list[dict], new_message: str, session) -> str:
    from sqlmodel import select
    from models import AgentConfig
    from services.call_orchestrator import build_system_prompt

    agent = session.exec(
        select(AgentConfig).where(AgentConfig.organization_id == org.id)
    ).first()

    if agent:
        system_prompt = build_system_prompt(agent)
    else:
        system_prompt = "Eres un asistente de ventas amable y profesional."

    system_prompt += (
        "\n\nIMPORTANTE: Estás respondiendo por WhatsApp (canal de texto). "
        "Sé muy conciso — máximo 2-3 oraciones por mensaje. "
        "No uses asteriscos, markdown ni listas. Escribe como en un chat."
    )

    api_key = (org.anthropic_api_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.error(f"[WhatsApp] No Anthropic API key for org={org.id}")
        return "Hola, en este momento no podemos atenderte. Por favor intenta más tarde."

    client = AsyncAnthropic(api_key=api_key)
    messages = conversation_history + [{"role": "user", "content": new_message}]

    response = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=300,
        system=system_prompt,
        messages=messages,
    )
    return response.content[0].text
