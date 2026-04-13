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


VAPI_ASSISTANT_ID = "45962a9a-8975-4dd1-92c7-b7bf5f85e3c3"


async def create_call(phone: str, system_prompt: str, agent_config: AgentConfig) -> dict:
    api_key, phone_number_id = _get_credentials()

    if not api_key or not phone_number_id:
        raise ValueError("Credenciales VAPI no configuradas. Ve a Configuración.")

    payload = {
        "assistantId": VAPI_ASSISTANT_ID,
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
