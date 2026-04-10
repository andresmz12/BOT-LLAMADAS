import os
import httpx
from models import AgentConfig

VAPI_API_URL = "https://api.vapi.ai"


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.getenv('VAPI_API_KEY', '')}"}


async def create_call(phone: str, system_prompt: str, agent_config: AgentConfig) -> dict:
    payload = {
        "phoneNumberId": os.getenv("VAPI_PHONE_NUMBER_ID", ""),
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

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{VAPI_API_URL}/call", json=payload, headers=_headers())
        resp.raise_for_status()
        return resp.json()


async def get_call(vapi_call_id: str) -> dict:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{VAPI_API_URL}/call/{vapi_call_id}", headers=_headers())
        resp.raise_for_status()
        return resp.json()
