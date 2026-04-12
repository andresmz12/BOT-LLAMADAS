import os
import httpx
from models import AgentConfig

VAPI_API_URL = "https://api.vapi.ai"


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.getenv('VAPI_API_KEY', '')}"}


async def create_call(phone: str, system_prompt: str, agent_config: AgentConfig) -> dict:
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

    if not api_key or not phone_number_id:
        raise ValueError("Credenciales VAPI no configuradas. Ve a Configuración.")

    payload = {
        "phoneNumberId": phone_number_id,
        "customer": {"number": phone},
        "assistant": {
            "model": {
                "provider": "anthropic",
                "model": "claude-sonnet-4-20250514",
                "systemPrompt": system_prompt,
            },
            "maxDurationSeconds": agent_config.max_call_duration,
        },
    }
    if agent_config.voice_id:
        payload["assistant"]["voice"] = {"voiceId": agent_config.voice_id}

    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{VAPI_API_URL}/call", json=payload, headers=headers)
        resp.raise_for_status()
        return resp.json()


async def get_call(vapi_call_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{VAPI_API_URL}/call/{vapi_call_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()
