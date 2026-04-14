import os
import httpx
from models import AgentConfig

VAPI_API_URL = "https://api.vapi.ai"


def _get_credentials() -> tuple[str, str]:
    """Returns (api_key, phone_number_id), falling back to DB if env vars are missing."""
    api_key = os.getenv("VAPI_API_KEY", "")
    phone_number_id = os.getenv("VAPI_PHONE_NUMBER_ID", "")

    if not api_key or not phone_number_id:
        from sqlmodel import Session, select
        from database import engine
        from models import Settings
        with Session(engine) as s:
            for row in s.exec(select(Settings)).all():
                if row.key == "vapi_api_key" and not api_key:
                    api_key = row.value
                if row.key == "vapi_phone_number_id" and not phone_number_id:
                    phone_number_id = row.value

    return api_key, phone_number_id


async def sync_to_vapi(agent_config: AgentConfig) -> str:
    """Creates or updates a VAPI assistant for this agent. Returns the vapi_assistant_id."""
    from services.call_orchestrator import build_system_prompt

    api_key, _ = _get_credentials()
    if not api_key:
        raise ValueError("VAPI API key no configurada. Ve a Configuración.")

    if agent_config.first_message_override:
        first_message = agent_config.first_message_override
    else:
        first_message = (
            f"Hola, buenos días. Habla {agent_config.agent_name} de {agent_config.company_name}, "
            "¿estoy hablando con {{customerName}}?"
        )

    if agent_config.voicemail_message:
        voicemail_msg = agent_config.voicemail_message
    else:
        voicemail_msg = (
            f"Hola, le llama {agent_config.agent_name} de {agent_config.company_name}. "
            "Por favor comuníquese con nosotros cuando pueda. Gracias."
        )

    payload = {
        "name": agent_config.name,
        "model": {
            "provider": "anthropic",
            "model": "claude-3-5-sonnet-20241022",
            "systemPrompt": build_system_prompt(agent_config),
            "temperature": agent_config.temperature,
            "maxTokens": 500,
        },
        "voice": {
            "provider": "azure",
            "voiceId": agent_config.voice_id or "DaliaMultilingual",
        },
        "transcriber": {
            "provider": "deepgram",
            "model": "nova-2",
            "language": "es",
        },
        "firstMessage": first_message,
        "language": "es",
        "endCallMessage": "Fue un placer hablar contigo. Que tengas un excelente día.",
        "voicemailMessage": voicemail_msg,
    }

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        if agent_config.vapi_assistant_id:
            resp = await client.put(
                f"{VAPI_API_URL}/assistant/{agent_config.vapi_assistant_id}",
                json=payload, headers=headers,
            )
        else:
            resp = await client.post(
                f"{VAPI_API_URL}/assistant",
                json=payload, headers=headers,
            )

        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ValueError(f"VAPI {resp.status_code}: {detail}")

        return resp.json()["id"]


async def create_call(phone: str, system_prompt: str, agent_config: AgentConfig) -> dict:
    api_key, phone_number_id = _get_credentials()

    if not api_key or not phone_number_id:
        raise ValueError("Credenciales VAPI no configuradas. Ve a Configuración.")

    if not agent_config.vapi_assistant_id:
        raise ValueError(
            f"El agente '{agent_config.name}' no está sincronizado con VAPI. "
            "Ve a Agentes y pulsa 'Sincronizar'."
        )

    payload = {
        "assistantId": agent_config.vapi_assistant_id,
        "phoneNumberId": phone_number_id,
        "customer": {"number": phone},
    }

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{VAPI_API_URL}/call", json=payload, headers=headers)
        if resp.status_code >= 400:
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            raise ValueError(f"VAPI {resp.status_code}: {detail}")
        return resp.json()


async def get_call(vapi_call_id: str) -> dict:
    api_key, _ = _get_credentials()
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{VAPI_API_URL}/call/{vapi_call_id}", headers=headers)
        resp.raise_for_status()
        return resp.json()
