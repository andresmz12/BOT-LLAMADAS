import os
import json
import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy import or_
from database import get_session
from models import Call, Prospect, Campaign, AgentConfig, Organization
from services import summary_generator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])

ws_manager = None


async def _verify_retell_signature(request: Request, raw_body: bytes):
    secret = os.getenv("RETELL_WEBHOOK_SECRET", "")
    if not secret:
        return
    sig = request.headers.get("x-retell-signature", "")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


@router.post("/retell")
async def retell_webhook(request: Request, session: Session = Depends(get_session)):
    raw_body = await request.body()
    await _verify_retell_signature(request, raw_body)
    body = json.loads(raw_body)
    event = body.get("event", "")
    call_data = body.get("call", {})
    retell_call_id = call_data.get("call_id", "")
    call_type_retell = call_data.get("call_type", "outbound_api")

    logger.info(f"[WEBHOOK] event={event} call_id={retell_call_id} type={call_type_retell}")
    logger.info(f"[WEBHOOK] call_data keys: {list(call_data.keys())}")

    call = session.exec(select(Call).where(Call.retell_call_id == retell_call_id)).first()
    logger.info(f"[WEBHOOK] Call in DB: {call.id if call else 'NOT FOUND'}")

    # ── Inbound call not yet in DB ─────────────────────────────────────────────
    if not call and call_type_retell == "inbound" and event in ("call_started", "call_ended", "call_analyzed"):
        agent_id_retell = call_data.get("agent_id", "")
        logger.info(f"[WEBHOOK] Inbound — searching agent_id={agent_id_retell}")

        agent = None
        if agent_id_retell:
            # Check BOTH outbound and inbound retell agent IDs
            agent = session.exec(
                select(AgentConfig).where(
                    or_(
                        AgentConfig.retell_agent_id == agent_id_retell,
                        AgentConfig.inbound_retell_agent_id == agent_id_retell,
                    )
                )
            ).first()

        logger.info(f"[WEBHOOK] Matched agent: {agent.id if agent else 'none'}")

        call = Call(
            prospect_id=None,
            campaign_id=None,
            retell_call_id=retell_call_id,
            status="initiated",
            call_type="inbound",
            organization_id=agent.organization_id if agent else None,
        )
        session.add(call)
        session.commit()
        session.refresh(call)
        logger.info(f"[WEBHOOK] Created inbound call record id={call.id}")

    if not call:
        logger.warning(f"[WEBHOOK] No call record for retell_call_id={retell_call_id} event={event} — ignoring")
        return {"ok": True}

    # ── call_started ───────────────────────────────────────────────────────────
    if event == "call_started":
        call.status = "in-progress"
        call.call_type = "inbound" if call_type_retell == "inbound" else "outbound"
        session.add(call)
        session.commit()
        logger.info(f"[WEBHOOK] call_started: call_id={call.id}")

    # ── call_ended / call_analyzed ─────────────────────────────────────────────
    elif event in ("call_ended", "call_analyzed"):
        transcript = call_data.get("transcript", "") or ""
        recording_url = call_data.get("recording_url")
        duration_ms = call_data.get("duration_ms") or call_data.get("call_length_ms") or 0
        start_ts = call_data.get("start_timestamp")
        end_ts = call_data.get("end_timestamp")
        call_analysis = call_data.get("call_analysis") or {}
        in_voicemail = call_analysis.get("in_voicemail", False)

        logger.info(
            f"[WEBHOOK] {event}: call_id={call.id} transcript_len={len(transcript)} "
            f"duration_ms={duration_ms} voicemail={in_voicemail} recording={bool(recording_url)}"
        )

        call.status = "ended"
        call.call_type = "inbound" if call_type_retell == "inbound" else "outbound"

        if end_ts:
            call.ended_at = datetime.fromtimestamp(end_ts / 1000)
        else:
            call.ended_at = datetime.utcnow()

        if start_ts:
            call.started_at = datetime.fromtimestamp(start_ts / 1000)

        if transcript:
            call.raw_transcript = transcript
        if recording_url:
            call.recording_url = recording_url
        if duration_ms:
            call.duration_seconds = int(duration_ms / 1000)

        # Get org Anthropic key
        org = session.get(Organization, call.organization_id) if call.organization_id else None
        org_api_key = (org.anthropic_api_key if org else "") or ""
        logger.info(f"[WEBHOOK] Anthropic key available: {bool(org_api_key)}")

        if in_voicemail:
            call.outcome = "voicemail"
            call.sentiment = "neutral"
            call.client_said = json.dumps([])
            call.agent_said = json.dumps([])
            call.services_mentioned = json.dumps([])
            call.notes = "Llamada derivada a buzón de voz"
            logger.info(f"[WEBHOOK] Voicemail — skipping analysis")

        elif transcript.strip():
            logger.info(f"[WEBHOOK] Analyzing transcript ({len(transcript)} chars) with Claude...")
            try:
                analysis = await summary_generator.analyze_transcript(transcript, api_key=org_api_key)
                logger.info(f"[WEBHOOK] Analysis OK: outcome={analysis.get('outcome')} sentiment={analysis.get('sentiment')} client_said={len(analysis.get('client_said', []))}")
                call.client_said = json.dumps(analysis.get("client_said", []))
                call.agent_said = json.dumps(analysis.get("agent_said", []))
                call.outcome = analysis.get("outcome") or call.outcome
                call.services_mentioned = json.dumps(analysis.get("services_mentioned", []))
                call.sentiment = analysis.get("sentiment")
                call.appointment_scheduled = analysis.get("appointment_scheduled", False)
                call.notes = analysis.get("notes", "")
                appt_date = analysis.get("appointment_date")
                if appt_date:
                    try:
                        call.appointment_date = datetime.fromisoformat(appt_date)
                    except Exception:
                        pass
            except Exception as exc:
                logger.error(f"[WEBHOOK] Transcript analysis failed: {exc}")

        else:
            logger.warning(f"[WEBHOOK] Empty transcript for call_id={call.id} — skipping analysis")

        session.add(call)

        # Update prospect status
        if call.prospect_id:
            prospect = session.get(Prospect, call.prospect_id)
            if prospect:
                outcome = call.outcome or "failed"
                if outcome == "voicemail":
                    prospect.status = "voicemail"
                elif outcome in ("interested", "callback_requested", "appointment_scheduled", "not_interested"):
                    prospect.status = "answered"
                else:
                    prospect.status = "failed"
                session.add(prospect)
                logger.info(f"[WEBHOOK] Prospect {prospect.id} status → {prospect.status}")

        # Update campaign counters
        if call.campaign_id:
            campaign = session.get(Campaign, call.campaign_id)
            if campaign:
                campaign.total_calls += 1
                outcome = call.outcome or "failed"
                if outcome == "voicemail":
                    campaign.voicemail += 1
                elif outcome == "interested":
                    campaign.interested += 1
                    campaign.answered += 1
                elif outcome in ("not_interested", "callback_requested"):
                    campaign.answered += 1
                elif outcome == "appointment_scheduled":
                    campaign.appointments_scheduled += 1
                    campaign.answered += 1
                else:
                    campaign.failed += 1
                session.add(campaign)

        session.commit()
        logger.info(
            f"[WEBHOOK] Saved call_id={call.id}: outcome={call.outcome} "
            f"sentiment={call.sentiment} duration={call.duration_seconds}s "
            f"client_said={len(json.loads(call.client_said or '[]'))} items"
        )

        # ── CRM webhook dispatch ───────────────────────────────────────────────
        if org and org.crm_webhook_enabled and org.crm_webhook_url:
            from services.crm_webhook import send_crm_webhook
            crm_prospect = session.get(Prospect, call.prospect_id) if call.prospect_id else None
            crm_agent = None
            if call.campaign_id:
                crm_camp = session.get(Campaign, call.campaign_id)
                if crm_camp:
                    crm_agent = session.get(AgentConfig, crm_camp.agent_config_id)
            await send_crm_webhook(org, call, crm_prospect, crm_agent, "call_ended", session)
            if call.outcome == "interested":
                await send_crm_webhook(org, call, crm_prospect, crm_agent, "interested", session)
            if call.appointment_scheduled:
                await send_crm_webhook(org, call, crm_prospect, crm_agent, "appointment_scheduled", session)

        if ws_manager and call.campaign_id:
            await ws_manager.broadcast(call.campaign_id, {
                "event": "call_updated",
                "call_id": call.id,
                "outcome": call.outcome,
                "sentiment": call.sentiment,
            })

    # ── call_failed ────────────────────────────────────────────────────────────
    elif event == "call_failed":
        disconnect_reason = call_data.get("disconnection_reason", "")
        logger.info(f"[WEBHOOK] call_failed: call_id={call.id} reason={disconnect_reason}")
        call.status = "failed"
        call.outcome = "failed"
        call.ended_at = datetime.utcnow()
        call.notes = f"Llamada fallida: {disconnect_reason}" if disconnect_reason else "Llamada fallida"
        session.add(call)
        if call.prospect_id:
            prospect = session.get(Prospect, call.prospect_id)
            if prospect:
                prospect.status = "failed"
                session.add(prospect)
        session.commit()

    return {"ok": True}
