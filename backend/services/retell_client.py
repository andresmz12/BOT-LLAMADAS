import os
import httpx
import logging
from typing import Optional
from models import AgentConfig

logger = logging.getLogger(__name__)
RETELL_API_URL = "https://api.retellai.com"


def _get_credentials(organization_id: Optional[int] = None) -> tuple[str, str]:
    api_key = os.getenv("RETELL_API_KEY", "")
    phone_number = os.getenv("RETELL_PHONE_NUMBER", "")

    if organization_id and (not api_key or not phone_number):
        from sqlmodel import Session
        from database import engine
        from models import Organization
        with Session(engine) as s:
            org = s.get(Organization, organization_id)
            if org:
                api_key = api_key or org.retell_api_key
                phone_number = phone_number or org.retell_phone_number

    return api_key, phone_number


async def set_inbound_agent(phone_number: str, agent_id: Optional[str], api_key: str):
    if not phone_number or not api_key:
        return
    headers = {"Authorization": f"Bearer {api_key}"}
    payload = {"inbound_agent_id": agent_id}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{RETELL_API_URL}/update-phone-number/{phone_number}",
            json=payload, headers=headers,
        )
        logger.info(f"[Retell] set_inbound_agent {phone_number} → {agent_id}: {resp.status_code} {resp.text}")
        if resp.status_code >= 400:
            raise ValueError(f"Retell phone update {resp.status_code}: {resp.text}")


async def _sync_llm_and_agent(
    client: httpx.AsyncClient,
    headers: dict,
    llm_id: Optional[str],
    agent_id: Optional[str],
    agent_label: str,
    llm_payload: dict,
    agent_payload: dict,
) -> tuple[str, str]:
    """Creates or updates a Retell LLM + Agent pair. Returns (agent_id, llm_id)."""
    if llm_id:
        url = f"{RETELL_API_URL}/update-retell-llm/{llm_id}"
        logger.info(f"[Retell] PATCH {url} ({agent_label}) prompt_len={len(llm_payload.get('general_prompt',''))}")
        resp = await client.patch(url, json=llm_payload, headers=headers)
    else:
        url = f"{RETELL_API_URL}/create-retell-llm"
        logger.info(f"[Retell] POST {url} ({agent_label})")
        resp = await client.post(url, json=llm_payload, headers=headers)

    logger.info(f"[Retell] LLM {agent_label} → {resp.status_code}: {resp.text[:300]}")
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise ValueError(f"Retell LLM error ({agent_label}) {resp.status_code}: {detail}")

    new_llm_id = resp.json()["llm_id"]

    agent_payload["response_engine"] = {"type": "retell-llm", "llm_id": new_llm_id}

    if agent_id:
        url = f"{RETELL_API_URL}/update-agent/{agent_id}"
        logger.info(f"[Retell] PATCH {url} ({agent_label})")
        resp = await client.patch(url, json=agent_payload, headers=headers)
    else:
        url = f"{RETELL_API_URL}/create-agent"
        logger.info(f"[Retell] POST {url} ({agent_label})")
        resp = await client.post(url, json=agent_payload, headers=headers)

    logger.info(f"[Retell] Agent {agent_label} → {resp.status_code}: {resp.text[:300]}")
    if resp.status_code >= 400:
        try:
            detail = resp.json()
        except Exception:
            detail = resp.text
        raise ValueError(f"Retell Agent error ({agent_label}) {resp.status_code}: {detail}")

    new_agent_id = resp.json()["agent_id"]
    logger.info(f"[Retell] {agent_label} synced: agent={new_agent_id} llm={new_llm_id}")
    return new_agent_id, new_llm_id


async def create_knowledge_base(name: str, file_bytes: bytes, filename: str, api_key: str) -> str:
    """Create a Retell KB and upload a file in one call. Returns knowledge_base_id."""
    headers = {"Authorization": f"Bearer {api_key}"}
    safe_name = name[:39]
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{RETELL_API_URL}/create-knowledge-base",
            headers=headers,
            data={"knowledge_base_name": safe_name},
            files={"knowledge_base_files": (filename, file_bytes, "application/octet-stream")},
        )
        logger.info(f"[Retell] create_knowledge_base '{safe_name}' → {resp.status_code}: {resp.text[:200]}")
        if resp.status_code >= 400:
            raise ValueError(f"Retell KB create {resp.status_code}: {resp.text}")
        return resp.json()["knowledge_base_id"]


async def attach_kb_to_llm(llm_id: str, kb_id: str, api_key: str):
    """Patch a Retell LLM to include a knowledge base."""
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.patch(
            f"{RETELL_API_URL}/update-retell-llm/{llm_id}",
            json={"knowledge_base_ids": [kb_id]},
            headers=headers,
        )
        logger.info(f"[Retell] attach_kb llm={llm_id} kb={kb_id} → {resp.status_code}")
        if resp.status_code >= 400:
            raise ValueError(f"Retell LLM KB attach {resp.status_code}: {resp.text}")


async def sync_to_retell(
    agent_config: AgentConfig,
    api_key: str = "",
    phone_number: str = "",
) -> tuple[str, str, Optional[str], Optional[str]]:
    """Creates or updates Retell agents for outbound (and optionally inbound).
    Returns (outbound_agent_id, outbound_llm_id, inbound_agent_id, inbound_llm_id)."""
    from services.call_orchestrator import build_system_prompt

    if not api_key or not phone_number:
        api_key_env, phone_env = _get_credentials(agent_config.organization_id)
        api_key = api_key or api_key_env
        phone_number = phone_number or phone_env

    if not api_key:
        raise ValueError("Retell API key no configurada. Ve a Configuración.")

    headers = {"Authorization": f"Bearer {api_key}"}
    voice_id = agent_config.voice_id or "retell-Andrea"

    base_agent_settings = {
        "voice_id": voice_id,
        "language": "es-ES",
        "responsiveness": 1,
        "interruption_sensitivity": 1,
        "enable_backchannel": True,
        "ambient_sound": "coffee-shop",
    }

    # ── OUTBOUND ─────────────────────────────────────────────────
    outbound_prompt = (
        agent_config.outbound_system_prompt
        or build_system_prompt(agent_config)
    )
    outbound_begin = (
        agent_config.outbound_first_message
        or agent_config.first_message_override
        or (
            f"Hola, buenos días. Habla {agent_config.agent_name} de "
            f"{agent_config.company_name}, ¿estoy hablando con {{{{customer_name}}}}?"
        )
    )

    outbound_llm_payload = {
        "model": "claude-4.6-sonnet",
        "general_prompt": outbound_prompt,
        "begin_message": outbound_begin,
        "general_tools": [],
    }
    if agent_config.retell_knowledge_base_id:
        outbound_llm_payload["knowledge_base_ids"] = [agent_config.retell_knowledge_base_id]
    default_voicemail_msg = (
        agent_config.voicemail_message
        or f"Hola, le llama {agent_config.agent_name} de {agent_config.company_name}. "
           "Le llamaremos de nuevo en otro momento. ¡Que tenga un buen día!"
    )
    outbound_agent_payload = {
        "agent_name": agent_config.name,
        **base_agent_settings,
        "voicemail_option": {
            "action": {
                "type": "leave_message",
                "text": default_voicemail_msg,
            },
        },
    }

    async with httpx.AsyncClient(timeout=30) as client:
        outbound_agent_id, outbound_llm_id = await _sync_llm_and_agent(
            client, headers,
            agent_config.retell_llm_id, agent_config.retell_agent_id,
            "outbound",
            outbound_llm_payload, outbound_agent_payload,
        )

        # ── INBOUND ──────────────────────────────────────────────
        inbound_agent_id: Optional[str] = None
        inbound_llm_id: Optional[str] = None

        if agent_config.inbound_enabled:
            inbound_prompt = agent_config.inbound_system_prompt or (
                f"Eres {agent_config.agent_name}, asesora virtual de "
                f"{agent_config.company_name}. Atiendes llamadas entrantes. "
                f"{agent_config.instructions or ''}"
            )
            inbound_begin = agent_config.inbound_first_message or (
                f"Hola, gracias por llamar a {agent_config.company_name}. "
                f"Mi nombre es {agent_config.agent_name}, ¿en qué le puedo ayudar hoy?"
            )

            inbound_llm_payload = {
                "model": "claude-4.6-sonnet",
                "general_prompt": inbound_prompt,
                "begin_message": inbound_begin,
                "general_tools": [],
            }
            if agent_config.retell_knowledge_base_id:
                inbound_llm_payload["knowledge_base_ids"] = [agent_config.retell_knowledge_base_id]
            inbound_agent_payload = {
                "agent_name": f"{agent_config.name} (Entrante)",
                **base_agent_settings,
            }

            inbound_agent_id, inbound_llm_id = await _sync_llm_and_agent(
                client, headers,
                agent_config.inbound_retell_llm_id, agent_config.inbound_retell_agent_id,
                "inbound",
                inbound_llm_payload, inbound_agent_payload,
            )

        # ── PHONE NUMBER ─────────────────────────────────────────
        if phone_number:
            phone_inbound_id = inbound_agent_id if agent_config.inbound_enabled else None
            try:
                await set_inbound_agent(phone_number, phone_inbound_id, api_key)
            except Exception as e:
                logger.warning(f"[Retell] set_inbound_agent failed (non-fatal): {e}")

        return outbound_agent_id, outbound_llm_id, inbound_agent_id, inbound_llm_id


async def create_call(
    phone: str,
    agent_config: AgentConfig,
    prospect_name: str = "",
    prospect_company: str = "",
    api_key: str = "",
    from_number: str = "",
) -> dict:
    if not api_key or not from_number:
        api_key_env, from_env = _get_credentials(agent_config.organization_id)
        api_key = api_key or api_key_env
        from_number = from_number or from_env

    if not api_key or not from_number:
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
        "from_number": from_number,
        "to_number": phone,
        "override_agent_id": agent_config.retell_agent_id,
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


async def create_call_direct(
    phone: str,
    retell_agent_id: str,
    agent_name: str = "",
    voice_id: str = "",
    prospect_name: str = "",
    prospect_company: str = "",
    api_key: str = "",
    from_number: str = "",
    voicemail_message: str = "",
) -> dict:
    """Like create_call but takes individual values — avoids detached SQLModel instance issues."""
    if not api_key or not from_number:
        raise ValueError("Credenciales Retell no configuradas.")
    if not retell_agent_id:
        raise ValueError(
            f"El agente '{agent_name}' no está sincronizado con Retell. "
            "Ve a Agentes y pulsa 'Sincronizar'."
        )

    payload = {
        "from_number": from_number,
        "to_number": phone,
        "override_agent_id": retell_agent_id,
        "retell_llm_dynamic_variables": {
            "customer_name": prospect_name or "cliente",
            "company_name": prospect_company or "",
        },
        "voicemail_option": {
            "action": {
                "type": "leave_message",
                "text": voicemail_message or "Hola, le llamaremos de nuevo en otro momento. ¡Que tenga un buen día!",
            },
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


async def get_call(retell_call_id: str, api_key: str = "") -> dict:
    if not api_key:
        api_key, _ = _get_credentials()
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{RETELL_API_URL}/v2/get-call/{retell_call_id}",
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()
