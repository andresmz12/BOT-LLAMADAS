import asyncio
import hashlib
import hmac
import json
import logging
import time
from datetime import datetime
from typing import Optional

import httpx
from sqlmodel import Session

from models import AgentConfig, Call, Organization, Prospect, WebhookLog

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_DELAY = 5
TIMEOUT = 10


def _build_payload(
    organization: Organization,
    call: Call,
    prospect: Optional[Prospect],
    agent_config: Optional[AgentConfig],
    event_type: str,
    timestamp: str,
) -> dict:
    return {
        "event": event_type,
        "timestamp": timestamp,
        "organization": {
            "id": organization.id,
            "name": organization.name,
        },
        "agent": {
            "name": agent_config.agent_name if agent_config else None,
            "company": agent_config.company_name if agent_config else None,
        },
        "prospect": {
            "id": prospect.id if prospect else None,
            "name": prospect.name if prospect else None,
            "phone": prospect.phone if prospect else None,
            "company": prospect.company if prospect else None,
        },
        "call": {
            "id": call.id,
            "direction": call.call_type,
            "duration_seconds": call.duration_seconds,
            "outcome": call.outcome,
            "sentiment": call.sentiment,
            "appointment_scheduled": call.appointment_scheduled,
            "appointment_date": call.appointment_date.isoformat() if call.appointment_date else None,
            "summary": call.notes,
            "client_said": json.loads(call.client_said or "[]"),
            "agent_said": json.loads(call.agent_said or "[]"),
            "services_mentioned": json.loads(call.services_mentioned or "[]"),
            "recording_url": call.recording_url,
        },
    }


def _sign_payload(secret: str, body_bytes: bytes) -> str:
    return hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()


async def send_crm_webhook(
    organization: Organization,
    call: Call,
    prospect: Optional[Prospect],
    agent_config: Optional[AgentConfig],
    event_type: str,
    session: Session,
) -> dict:
    if not organization.crm_webhook_enabled:
        return {"success": False, "status_code": None, "response": "disabled"}
    if not organization.crm_webhook_url:
        return {"success": False, "status_code": None, "response": "no url configured"}

    try:
        enabled_events = json.loads(organization.crm_events or '["call_ended","interested"]')
    except Exception:
        enabled_events = ["call_ended", "interested"]

    if event_type not in enabled_events:
        return {"success": False, "status_code": None, "response": "event not enabled for this org"}

    timestamp = datetime.utcnow().isoformat() + "Z"
    payload = _build_payload(organization, call, prospect, agent_config, event_type, timestamp)
    body_bytes = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "User-Agent": "ZyraVoice-Webhook/1.0",
        "X-ZyraVoice-Event": event_type,
        "X-ZyraVoice-Timestamp": timestamp,
    }
    if organization.crm_webhook_secret:
        sig = _sign_payload(organization.crm_webhook_secret, body_bytes)
        headers["X-ZyraVoice-Signature"] = f"sha256={sig}"

    last_status: Optional[int] = None
    last_response = ""
    success = False
    duration_ms = 0

    for attempt in range(1, MAX_RETRIES + 1):
        t0 = time.monotonic()
        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                resp = await client.post(
                    organization.crm_webhook_url,
                    content=body_bytes,
                    headers=headers,
                )
            duration_ms = int((time.monotonic() - t0) * 1000)
            last_status = resp.status_code
            last_response = resp.text[:500]
            success = resp.status_code < 400
            logger.info(
                f"[CRM_WEBHOOK] org={organization.id} event={event_type} "
                f"attempt={attempt} status={last_status} duration={duration_ms}ms"
            )
            if success:
                break
        except Exception as exc:
            duration_ms = int((time.monotonic() - t0) * 1000)
            last_status = None
            last_response = str(exc)[:500]
            success = False
            logger.warning(
                f"[CRM_WEBHOOK] org={organization.id} event={event_type} "
                f"attempt={attempt} error: {exc}"
            )

        if attempt < MAX_RETRIES:
            await asyncio.sleep(RETRY_DELAY)

    try:
        log_entry = WebhookLog(
            organization_id=organization.id,
            event_type=event_type,
            success=success,
            status_code=last_status,
            response_text=last_response,
            duration_ms=duration_ms,
        )
        session.add(log_entry)
        session.commit()
    except Exception as db_exc:
        logger.error(f"[CRM_WEBHOOK] Failed to write WebhookLog: {db_exc}")

    return {"success": success, "status_code": last_status, "response": last_response}


async def send_test_webhook(organization: Organization, session: Session) -> dict:
    """Send a test webhook with realistic fake data to the org's configured URL."""
    fake_call = Call(
        id=0,
        retell_call_id="test_zyravoice_abc123",
        status="ended",
        call_type="outbound",
        outcome="interested",
        sentiment="positive",
        duration_seconds=187,
        appointment_scheduled=True,
        appointment_date=datetime(2026, 4, 28, 10, 0, 0),
        services_mentioned='["Formación de LLC","ITIN"]',
        client_said='["Me interesa saber más sobre la LLC","¿Cuánto tiempo toma?"]',
        agent_said='["Le puedo ayudar con la formación de su LLC","El proceso toma entre 5 y 7 días hábiles"]',
        notes="Cliente muy interesado en abrir una LLC. Agenda cita para el lunes a las 10am.",
        recording_url=None,
        started_at=datetime.utcnow(),
        ended_at=datetime.utcnow(),
        organization_id=organization.id,
    )
    fake_prospect = Prospect(
        id=0,
        name="María González",
        phone="+15551234567",
        company="González Catering LLC",
        campaign_id=0,
    )
    fake_agent = AgentConfig(
        id=0,
        name="Isabella - Test",
        agent_name="Isabella",
        company_name=organization.name,
    )

    # Override enabled flag so the test always fires regardless of org config
    test_org = Organization(
        id=organization.id,
        name=organization.name,
        crm_webhook_url=organization.crm_webhook_url,
        crm_webhook_enabled=True,
        crm_webhook_secret=organization.crm_webhook_secret,
        crm_type=organization.crm_type,
        crm_events='["call_ended","interested","appointment_scheduled"]',
    )

    return await send_crm_webhook(test_org, fake_call, fake_prospect, fake_agent, "call_ended", session)
