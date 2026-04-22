import json
import logging
from datetime import datetime

import httpx

from models import Organization

logger = logging.getLogger(__name__)

TIMEOUT = 15
NATIVE_CRM_TYPES = {"monday", "hubspot", "gohighlevel", "zoho", "salesforce"}


async def send_call_to_crm(org: Organization, call_data: dict, call=None, prospect=None, agent_config=None, session=None) -> None:
    crm_type = (org.crm_type or "").lower()

    if crm_type == "monday":
        await _send_monday(org, call_data)
    elif crm_type == "hubspot":
        await _send_hubspot(org, call_data)
    elif crm_type == "gohighlevel":
        await _send_gohighlevel(org, call_data)
    elif crm_type == "zoho":
        await _send_zoho(org, call_data)
    elif crm_type == "salesforce":
        await _send_salesforce(org, call_data)
    else:
        # Generic webhook — preserve existing multi-event behavior exactly
        from services.crm_webhook import send_crm_webhook
        await send_crm_webhook(org, call, prospect, agent_config, "call_ended", session)
        if call and call.outcome == "interested":
            await send_crm_webhook(org, call, prospect, agent_config, "interested", session)
        if call and call.appointment_scheduled:
            await send_crm_webhook(org, call, prospect, agent_config, "appointment_scheduled", session)


async def _get_monday_board_columns(api_key: str, board_id: int) -> list:
    """Fetch column id/title/type for a Monday board."""
    query = f'{{ boards(ids: [{board_id}]) {{ columns {{ id title type }} }} }}'
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(
            "https://api.monday.com/v2",
            json={"query": query},
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json", "API-Version": "2024-01"},
        )
    data = resp.json()
    return data.get("data", {}).get("boards", [{}])[0].get("columns", [])


async def _send_monday(org: Organization, call_data: dict) -> None:
    if not org.crm_api_key or not org.crm_board_or_list_id:
        logger.warning(
            f"[CRM_MONDAY] org={org.id} skipping — "
            f"api_key={'SET' if org.crm_api_key else 'MISSING'} "
            f"board_id={org.crm_board_or_list_id!r}"
        )
        return

    phone = call_data.get("phone") or ""
    call_result = call_data.get("call_result") or ""
    duration = call_data.get("duration_seconds") or 0
    summary = call_data.get("summary") or ""
    campaign = call_data.get("campaign_name") or ""
    ts = call_data.get("timestamp") or datetime.utcnow().isoformat()
    date_only = ts[:10]  # YYYY-MM-DD

    STATUS_INDEX = {
        "interested": 1, "appointment_scheduled": 1,
        "not_interested": 2,
        "callback_requested": 0, "voicemail": 0, "failed": 0,
    }
    status_index = STATUS_INDEX.get(call_result, 0)

    try:
        board_id = int(org.crm_board_or_list_id)
    except ValueError as exc:
        logger.error(f"[CRM_MONDAY] org={org.id} board_id not integer: {org.crm_board_or_list_id!r} — {exc}")
        return

    # Fetch real column IDs from Monday board
    try:
        columns = await _get_monday_board_columns(org.crm_api_key, board_id)
        logger.info(f"[CRM_MONDAY] org={org.id} board={board_id} columns={[(c['id'], c['type'], c['title']) for c in columns]}")
    except Exception as exc:
        logger.error(f"[CRM_MONDAY] org={org.id} failed to fetch columns: {exc}")
        columns = []

    # Build column_values using real IDs.
    # Match by type; for text columns use title keywords to assign phone vs email.
    email = call_data.get("email", "") or ""
    _email_keywords = {"email", "correo", "mail", "e-mail"}
    _phone_keywords = {"phone", "telefono", "teléfono", "tel", "celular", "movil", "móvil"}
    _date_keywords = {"fecha", "date", "dia", "día"}
    _duration_keywords = {"duracion", "duración", "duration", "dur", "segundos", "tiempo"}
    _summary_keywords = {"resumen", "summary", "notas", "notes", "observ", "detalle"}

    seen_types: set = set()
    col_values: dict = {}
    for col in columns:
        cid, ctype = col["id"], col["type"]
        title_lower = col["title"].lower()

        if ctype == "color":
            # Status — only first one
            if "color" not in seen_types:
                col_values[cid] = {"index": status_index}
                seen_types.add("color")
        elif ctype == "date":
            if "date" not in seen_types:
                col_values[cid] = {"date": date_only}
                seen_types.add("date")
        elif ctype == "numeric":
            if "numeric" not in seen_types:
                col_values[cid] = str(duration)
                seen_types.add("numeric")
        elif ctype == "long_text":
            if "long_text" not in seen_types:
                col_values[cid] = {"text": summary}
                seen_types.add("long_text")
        elif ctype == "email":
            col_values[cid] = {"email": email, "text": email}
        elif ctype == "phone":
            col_values[cid] = {"phone": phone, "countryShortName": "US"}
        elif ctype == "text":
            # Use title keywords to decide what goes in each text column
            if any(k in title_lower for k in _email_keywords):
                col_values[cid] = email
            elif any(k in title_lower for k in _phone_keywords):
                col_values[cid] = phone
            elif any(k in title_lower for k in _duration_keywords):
                col_values[cid] = str(duration)
            elif any(k in title_lower for k in _summary_keywords):
                col_values[cid] = summary
            elif "text_first" not in seen_types:
                # First unrecognized text column → phone (backward compat)
                col_values[cid] = phone
                seen_types.add("text_first")

    # Fallback: if no columns found, use generic IDs
    if not col_values:
        logger.warning(f"[CRM_MONDAY] org={org.id} no columns mapped — using generic fallback IDs")
        col_values = {
            "status": {"index": status_index},
            "date": {"date": date_only},
            "numbers": str(duration),
            "long_text": {"text": summary},
            "text": phone,
        }

    logger.info(f"[CRM_MONDAY] org={org.id} board={board_id} phone={phone} result={call_result} col_ids={list(col_values.keys())}")

    item_name = (phone or "ZyraVoice Lead").replace('"', '\\"')
    col_values_str = json.dumps(col_values, ensure_ascii=False)
    col_values_escaped = col_values_str.replace('\\', '\\\\').replace('"', '\\"')

    mutation = (
        f'mutation {{'
        f'  create_item('
        f'    board_id: {board_id},'
        f'    item_name: "{item_name}",'
        f'    column_values: "{col_values_escaped}"'
        f'  ) {{ id }}'
        f'}}'
    )

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.monday.com/v2",
                json={"query": mutation},
                headers={
                    "Authorization": f"Bearer {org.crm_api_key}",
                    "Content-Type": "application/json",
                    "API-Version": "2024-01",
                },
            )
        body = resp.text
        # Monday returns HTTP 200 even for GraphQL errors — check body explicitly
        if resp.status_code < 400:
            try:
                parsed = resp.json()
            except Exception:
                parsed = {}
            if "errors" in parsed:
                logger.error(f"[CRM_MONDAY] org={org.id} GraphQL error: {parsed['errors']}")
            else:
                item_id = parsed.get("data", {}).get("create_item", {}).get("id")
                logger.info(f"[CRM_MONDAY] org={org.id} item created id={item_id} status={resp.status_code}")
        else:
            logger.error(f"[CRM_MONDAY] org={org.id} HTTP error status={resp.status_code} body={body[:400]}")
    except Exception as exc:
        logger.error(f"[CRM_MONDAY] org={org.id} request error: {exc}", exc_info=True)


async def _send_hubspot(org: Organization, call_data: dict) -> None:
    if not org.crm_api_key:
        logger.warning(f"[CRM_HUBSPOT] org={org.id} missing api_key — skipping")
        return

    phone = call_data.get("phone") or ""
    call_result = call_data.get("call_result") or ""
    summary = call_data.get("summary") or ""
    campaign = call_data.get("campaign_name") or ""
    notes = f"Campaña: {campaign}\n\n{summary}".strip() if campaign else summary

    body = {
        "properties": {
            "firstname": phone,
            "phone": phone,
            "hs_lead_status": call_result,
            "notes": notes,
        }
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://api.hubapi.com/crm/v3/objects/contacts",
                json=body,
                headers={
                    "Authorization": f"Bearer {org.crm_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code < 400:
            logger.info(f"[CRM_HUBSPOT] org={org.id} contact created status={resp.status_code}")
        else:
            logger.error(f"[CRM_HUBSPOT] org={org.id} failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as exc:
        logger.error(f"[CRM_HUBSPOT] org={org.id} request error: {exc}")


async def _send_gohighlevel(org: Organization, call_data: dict) -> None:
    if not org.crm_api_key:
        logger.warning(f"[CRM_GHL] org={org.id} missing api_key — skipping")
        return

    phone = call_data.get("phone") or ""
    call_result = call_data.get("call_result") or ""
    summary = call_data.get("summary") or ""
    campaign = call_data.get("campaign_name") or ""

    body = {
        "phone": phone,
        "tags": [call_result] if call_result else [],
        "customField": {
            "summary": summary,
            "campaign": campaign,
        },
    }
    if org.crm_board_or_list_id:
        body["locationId"] = org.crm_board_or_list_id

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://rest.gohighlevel.com/v1/contacts/",
                json=body,
                headers={
                    "Authorization": f"Bearer {org.crm_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code < 400:
            logger.info(f"[CRM_GHL] org={org.id} contact created status={resp.status_code}")
        else:
            logger.error(f"[CRM_GHL] org={org.id} failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as exc:
        logger.error(f"[CRM_GHL] org={org.id} request error: {exc}")


async def _send_zoho(org: Organization, call_data: dict) -> None:
    if not org.crm_api_key:
        logger.warning(f"[CRM_ZOHO] org={org.id} missing api_key — skipping")
        return

    phone = call_data.get("phone") or ""
    summary = call_data.get("summary") or ""
    campaign = call_data.get("campaign_name") or ""
    description = f"Campaña: {campaign}\n\n{summary}".strip() if campaign else summary

    body = {
        "data": [
            {
                "Phone": phone,
                "Last_Name": phone or "ZyraVoice Lead",
                "Lead_Source": "ZyraVoice",
                "Description": description,
            }
        ]
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                "https://www.zohoapis.com/crm/v2/Leads",
                json=body,
                headers={
                    "Authorization": f"Zoho-oauthtoken {org.crm_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code < 400:
            logger.info(f"[CRM_ZOHO] org={org.id} lead created status={resp.status_code}")
        else:
            logger.error(f"[CRM_ZOHO] org={org.id} failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as exc:
        logger.error(f"[CRM_ZOHO] org={org.id} request error: {exc}")


async def _send_salesforce(org: Organization, call_data: dict) -> None:
    if not org.crm_api_key:
        logger.warning(f"[CRM_SF] org={org.id} missing api_key — skipping")
        return

    try:
        extra = json.loads(org.crm_extra_config or "{}")
    except Exception:
        extra = {}
    instance_url = extra.get("instance_url", "").rstrip("/")
    if not instance_url:
        logger.warning(f"[CRM_SF] org={org.id} missing instance_url in crm_extra_config — skipping")
        return

    phone = call_data.get("phone") or ""
    summary = call_data.get("summary") or ""
    campaign = call_data.get("campaign_name") or ""
    description = f"Campaña: {campaign}\n\n{summary}".strip() if campaign else summary

    body = {
        "Phone": phone,
        "LastName": phone or "ZyraVoice Lead",
        "LeadSource": "ZyraVoice",
        "Description": description,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{instance_url}/services/data/v57.0/sobjects/Lead/",
                json=body,
                headers={
                    "Authorization": f"Bearer {org.crm_api_key}",
                    "Content-Type": "application/json",
                },
            )
        if resp.status_code < 400:
            logger.info(f"[CRM_SF] org={org.id} lead created status={resp.status_code}")
        else:
            logger.error(f"[CRM_SF] org={org.id} failed status={resp.status_code} body={resp.text[:300]}")
    except Exception as exc:
        logger.error(f"[CRM_SF] org={org.id} request error: {exc}")
