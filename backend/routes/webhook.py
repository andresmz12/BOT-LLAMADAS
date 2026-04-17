import json
import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends
from sqlmodel import Session, select
from database import get_session
from models import Call, Prospect, Campaign, AgentConfig, Organization
from services import summary_generator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])

ws_manager = None


@router.post("/retell")
async def retell_webhook(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    event = body.get("event", "")
    call_data = body.get("call", {})
    retell_call_id = call_data.get("call_id", "")
    call_type_retell = call_data.get("call_type", "outbound_api")

    logger.info(f"Retell webhook event: {event}, call_id: {retell_call_id}, type: {call_type_retell}")

    call = session.exec(select(Call).where(Call.retell_call_id == retell_call_id)).first()

    # Handle inbound calls not in DB
    if not call and call_type_retell == "inbound" and event in ("call_started", "call_ended", "call_analyzed"):
        agent_id_retell = call_data.get("agent_id", "")
        agent = session.exec(
            select(AgentConfig).where(AgentConfig.retell_agent_id == agent_id_retell)
        ).first() if agent_id_retell else None
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

    if event == "call_started" and call:
        call.status = "in-progress"
        if call_type_retell == "inbound":
            call.call_type = "inbound"
        session.add(call)
        session.commit()

    elif event in ("call_ended", "call_analyzed"):
        transcript = call_data.get("transcript", "")
        recording_url = call_data.get("recording_url")
        duration_ms = call_data.get("duration_ms") or call_data.get("call_length_ms", 0)
        start_ts = call_data.get("start_timestamp")
        end_ts = call_data.get("end_timestamp")

        call_analysis = call_data.get("call_analysis") or {}
        in_voicemail = call_analysis.get("in_voicemail", False)

        if call:
            call.status = "ended"
            call.call_type = "inbound" if call_type_retell == "inbound" else "outbound"
            call.ended_at = datetime.utcnow() if not end_ts else datetime.utcfromtimestamp(end_ts / 1000)
            if start_ts:
                call.started_at = datetime.utcfromtimestamp(start_ts / 1000)
            call.raw_transcript = transcript
            if recording_url:
                call.recording_url = recording_url
            if duration_ms:
                call.duration_seconds = int(duration_ms / 1000)

            # Get org's Anthropic key
            org = session.get(Organization, call.organization_id) if call.organization_id else None
            org_api_key = (org.anthropic_api_key if org else "") or ""

            if in_voicemail:
                call.outcome = "voicemail"
                call.sentiment = "neutral"
                call.client_said = json.dumps([])
                call.agent_said = json.dumps([])
                call.services_mentioned = json.dumps([])
                call.notes = "Llamada derivada a buzón de voz"
            else:
                analysis = await summary_generator.analyze_transcript(transcript, api_key=org_api_key)
                call.client_said = json.dumps(analysis.get("client_said", []))
                call.agent_said = json.dumps(analysis.get("agent_said", []))
                call.outcome = analysis.get("outcome")
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

            session.add(call)

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

            if call.campaign_id:
                campaign = session.get(Campaign, call.campaign_id)
                if campaign:
                    campaign.total_calls += 1
                    if call.outcome == "voicemail":
                        campaign.voicemail += 1
                    elif call.outcome == "interested":
                        campaign.interested += 1
                        campaign.answered += 1
                    elif call.outcome in ("not_interested", "callback_requested"):
                        campaign.answered += 1
                    elif call.outcome == "appointment_scheduled":
                        campaign.appointments_scheduled += 1
                        campaign.answered += 1
                    else:
                        campaign.failed += 1
                    session.add(campaign)

            session.commit()

            if ws_manager and call.campaign_id:
                await ws_manager.broadcast(call.campaign_id, {
                    "event": "call_updated",
                    "call_id": call.id,
                    "outcome": call.outcome,
                    "sentiment": call.sentiment,
                })

    elif event == "call_failed" and call:
        call.status = "failed"
        call.outcome = "failed"
        call.ended_at = datetime.utcnow()
        session.add(call)
        if call.prospect_id:
            prospect = session.get(Prospect, call.prospect_id)
            if prospect:
                prospect.status = "failed"
                session.add(prospect)
        session.commit()

    return {"ok": True}
