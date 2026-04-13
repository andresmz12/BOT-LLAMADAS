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


async def create_call(phone: str, system_prompt: str, agent_config: AgentConfig) -> dict:
    api_key, phone_number_id = _get_credentials()

    if not api_key or not phone_number_id:
        raise ValueError("Credenciales VAPI no configuradas. Ve a Configuración.")

    first_message = (
        f"Hola, ¿cómo está? Mi nombre es {agent_config.agent_name}, "
        f"le llamo de parte de {agent_config.company_name}. "
        f"¿Tiene un momento para hablar?"
    )

    payload = {
        "phoneNumberId": phone_number_id,
        "customer": {"number": phone},
        "assistant": {
            "language": "es-MX",
            "transcriber": {
                "provider": "deepgram",
                "model": "nova-2",
                "language": "es",
            },
            "firstMessage": first_message,
            "model": {
                "provider": "anthropic",
                "model": "claude-3-5-sonnet-20241022",
                "systemPrompt": system_prompt,
            },
            "voice": {
                "provider": "azure",
                "voiceId": agent_config.voice_id or "es-MX-DaliaNeural",
            },
            "maxDurationSeconds": agent_config.max_call_duration,
        },
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
