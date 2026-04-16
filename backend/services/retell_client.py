import os
import httpx
import logging
from models import AgentConfig

logger = logging.getLogger(__name__)
RETELL_API_URL = "https://api.retellai.com"


def _get_credentials() -> tuple[str, str]:
    """Returns (api_key, phone_number), falling back to DB Settings if env vars are missing."""
    api_key = os.getenv("RETELL_API_KEY", "")
    phone_number = os.getenv("RETELL_PHONE_NUMBER", "")

    if not api_key or not phone_number:
        from sqlmodel import Session, select
        from database import engine
        from models import Settings
        with Session(engine) as s:
            for row in s.exec(select(Settings)).all():
                if row.key == "retell_api_key" and not api_key:
                    api_key = row.value
                if row.key == "retell_phone_number" and not phone_number:
                    phone_number = row.value

    return api_key, phone_number


async def sync_to_retell(agent_config: AgentConfig) -> tuple[str, str]:
    """Creates or updates a Retell LLM + Agent. Returns (retell_agent_id, retell_llm_id)."""
    from services.call_orchestrator import build_system_prompt

    api_key, _ = _get_credentials()
    if not api_key:
        raise ValueError("Retell API key no configurada. Ve a Configuración.")

    headers = {"Authorization": f"Bearer {api_key}"}

    if agent_config.first_message_override:
        begin_message = agent_config.first_message_override
    else:
        begin_message = (
            f"Hola, buenos días. Habla {agent_config.agent_name} de {agent_config.company_name}, "
            "¿estoy hablando con {{customer_name}}?"
        )

    llm_payload = {
        "model": "claude-4.6-sonnet",
        "general_prompt": build_system_prompt(agent_config),
        "begin_message": begin_message,
        "general_tools": [],
    }

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: Create or update the Retell LLM
        if agent_config.retell_llm_id:
            resp = await client.patch(
                f"{RETELL_API_URL}/update-retell-llm/{agent_config.retell_llm_id}",
                json=llm_payload, headers=headers,
            )
        else:
            resp = await client.post(
                f"{RETELL_API_URL}/create-retell-llm",
                json=llm_payload, headers=headers,
            )

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ValueError(f"Retell LLM {resp.status_code}: {detail}")

        llm_id = resp.json()["llm_id"]
        logger.info(f"Retell LLM synced: {llm_id}")

        # Step 2: Create or update the Retell Agent
        agent_payload = {
            "agent_name": agent_config.name,
            "response_engine": {
                "type": "retell-llm",
                "llm_id": llm_id,
            },
            "voice_id": agent_config.voice_id,
            "language": "es-ES",
            "responsiveness": 1,
            "interruption_sensitivity": 1,
            "enable_backchannel": True,
            "ambient_sound": "coffee-shop",
        }

        if agent_config.retell_agent_id:
            resp = await client.patch(
                f"{RETELL_API_URL}/update-agent/{agent_config.retell_agent_id}",
                json=agent_payload, headers=headers,
            )
        else:
            resp = await client.post(
                f"{RETELL_API_URL}/create-agent",
                json=agent_payload, headers=headers,
            )

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ValueError(f"Retell Agent {resp.status_code}: {detail}")

        agent_id = resp.json()["agent_id"]
        logger.info(f"Retell Agent synced: {agent_id}")
        return agent_id, llm_id


async def create_call(
    phone: str,
    agent_config: AgentConfig,
    prospect_name: str = "",
    prospect_company: str = "",
) -> dict:
    api_key, phone_number = _get_credentials()

    if not api_key or not phone_number:
        raise ValueError("Credenciales Retell no configuradas. Ve a Configuración.")

    if not agent_config.retell_agent_id:
        raise ValueError(
            f"El agente '{agent_config.name}' no está sincronizado con Retell. "
            "Ve a Agentes y pulsa 'Sincronizar'."
        )

    if not agent_config.voice_id:
        raise ValueError(
            f"El agente '{agent_config.name}' no tiene voz configurada. "
            "Ve a Agentes, edítalo y selecciona una voz."
        )

    payload = {
        "from_number": phone_number,
        "to_number": phone,
        "agent_id": agent_config.retell_agent_id,
        "retell_llm_dynamic_variables": {
            "customer_name": prospect_name or "cliente",
            "company_name": prospect_company or "",
        },
    }

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{RETELL_API_URL}/v2/create-phone-call",
            json=payload, headers=headers,
        )
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ValueError(f"Retell {resp.status_code}: {detail}")
        return resp.json()


async def get_call(retell_call_id: str) -> dict:
    api_key, _ = _get_credentials()
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{RETELL_API_URL}/v2/get-call/{retell_call_id}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()
