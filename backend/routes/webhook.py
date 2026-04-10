import json
import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends
from sqlmodel import Session, select
from database import get_session
from models import Call, Prospect, Campaign
from services import summary_generator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])

# Injected from main.py
ws_manager = None


@router.post("/vapi")
async def vapi_webhook(request: Request, session: Session = Depends(get_session)):
    body = await request.json()
    event_type = body.get("message", {}).get("type") or body.get("type", "")
    call_data = body.get("message", {}).get("call") or body.get("call", {})
    vapi_call_id = call_data.get("id", "")

    logger.info(f"Webhook event: {event_type}, vapi_call_id: {vapi_call_id}")

    call = session.exec(select(Call).where(Call.vapi_call_id == vapi_call_id)).first()

    if event_type == "call-started" and call:
        call.status = "in-progress"
        session.add(call)
        session.commit()

    elif event_type in ("call-ended", "end-of-call-report"):
        artifact = body.get("message", {}).get("artifact", {})
        transcript = artifact.get("transcript", "") or body.get("transcript", "")
        recording_url = artifact.get("recordingUrl") or call_data.get("recordingUrl")

        if call:
            call.status = "ended"
            call.ended_at = datetime.utcnow()
            call.raw_transcript = transcript
            if recording_url:
                call.recording_url = recording_url
            duration = call_data.get("duration")
            if duration:
                call.duration_seconds = int(duration)

            analysis = await summary_generator.analyze_transcript(transcript)
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

    elif event_type == "call-failed" and call:
        call.status = "failed"
        call.outcome = "failed"
        call.ended_at = datetime.utcnow()
        session.add(call)
        prospect = session.get(Prospect, call.prospect_id)
        if prospect:
            prospect.status = "failed"
            session.add(prospect)
        session.commit()

    return {"ok": True}
