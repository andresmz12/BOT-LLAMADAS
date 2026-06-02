import os
import json
import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Request, Depends, HTTPException, BackgroundTasks
from sqlmodel import Session, select
from sqlalchemy import or_
from database import get_session
from models import Call, Prospect, Campaign, AgentConfig, Organization
from services import summary_generator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhook", tags=["webhook"])

ws_manager = None


async def _bg_analyze_and_sync(
    call_id: int,
    transcript: str,
    in_voicemail: bool,
    org_id: int | None,
    prospect_id: int | None,
    campaign_id: int | None,
    duration_seconds: int = 0,
):
    """Background task: Claude analysis + DB update + CRM dispatch.
    Runs AFTER Retell already received 200, preventing duplicate retries."""
    from database import engine
    from sqlmodel import Session as _Session

    with _Session(engine) as s:
        call = s.get(Call, call_id)
        if not call:
            logger.error(f"[BG] call_id={call_id} not found")
            return

        org = None
        try:
            org = s.get(Organization, org_id) if org_id else None
        except Exception as e:
            logger.error(f"[BG] org load failed: {e}")
        org_api_key = (org.anthropic_api_key if org else "") or ""

        if in_voicemail:
            call.outcome = "voicemail"
            call.sentiment = "neutral"
            call.client_said = json.dumps([])
            call.agent_said = json.dumps([])
            call.services_mentioned = json.dumps([])
            call.notes = "Llamada derivada a buzón de voz"
            logger.info(f"[BG] call_id={call_id} voicemail")
        elif transcript.strip():
            logger.info(f"[BG] call_id={call_id} analyzing {len(transcript)} chars with Claude...")
            try:
                analysis = await summary_generator.analyze_transcript(transcript, api_key=org_api_key, duration_seconds=duration_seconds)
                logger.info(f"[BG] call_id={call_id} outcome={analysis.get('outcome')} sentiment={analysis.get('sentiment')}")
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
                logger.error(f"[BG] Claude analysis failed: {exc}")
        else:
            logger.warning(f"[BG] call_id={call_id} empty transcript — skipping analysis")

        s.add(call)

        if prospect_id:
            prospect = s.get(Prospect, prospect_id)
            if prospect:
                outcome = call.outcome or "no_answer"
                if outcome == "voicemail":
                    prospect.status = "voicemail"
                elif outcome in ("interested", "callback_requested", "appointment_scheduled",
                                 "not_interested", "wrong_number"):
                    prospect.status = "answered"
                elif outcome == "no_answer":
                    prospect.status = "no_answer"
                else:
                    prospect.status = "answered"
                s.add(prospect)

        if campaign_id:
            campaign = s.get(Campaign, campaign_id)
            if campaign:
                campaign.total_calls += 1
                outcome = call.outcome or "no_answer"
                if outcome == "voicemail":
                    campaign.voicemail += 1
                elif outcome == "interested":
                    campaign.interested += 1
                    campaign.answered += 1
                elif outcome in ("not_interested", "callback_requested", "wrong_number"):
                    campaign.answered += 1
                elif outcome == "appointment_scheduled":
                    campaign.appointments_scheduled += 1
                    campaign.answered += 1
                elif outcome in ("failed", "no_answer"):
                    campaign.failed += 1
                s.add(campaign)

        s.commit()
        logger.info(f"[BG] Saved call_id={call_id}: outcome={call.outcome} sentiment={call.sentiment}")

        # CRM dispatch
        if org and org.crm_webhook_enabled and org.crm_type and org.crm_type != "none":
            try:
                from services.crm_service import send_call_to_crm
                crm_prospect = s.get(Prospect, prospect_id) if prospect_id else None
                crm_camp = s.get(Campaign, campaign_id) if campaign_id else None
                crm_agent = s.get(AgentConfig, crm_camp.agent_config_id) if crm_camp else None
                call_data_crm = {
                    "phone": crm_prospect.phone if crm_prospect else None,
                    "prospect_name": crm_prospect.name if crm_prospect else None,
                    "email": getattr(crm_prospect, "email", "") or "" if crm_prospect else "",
                    "call_result": call.outcome,
                    "duration_seconds": call.duration_seconds,
                    "summary": call.notes,
                    "campaign_name": crm_camp.name if crm_camp else None,
                    "transcript": call.raw_transcript,
                    "timestamp": (call.ended_at or datetime.utcnow()).isoformat(),
                }
                logger.info(f"[BG] CRM dispatch type={org.crm_type} call_id={call_id}")
                await send_call_to_crm(org, call_data_crm, call, crm_prospect, crm_agent, s)
            except Exception as e:
                logger.error(f"[BG] CRM sync failed: {e}", exc_info=True)

        # Email marketing — fire-and-forget, never fails the webhook
        try:
            from services.sendgrid_service import send_post_call_email
            if org and call.outcome:
                email_prospect = s.get(Prospect, prospect_id) if prospect_id else None
                email_camp = s.get(Campaign, campaign_id) if campaign_id else None
                email_agent = s.get(AgentConfig, email_camp.agent_config_id) if email_camp else None
                await send_post_call_email(
                    org,
                    email_prospect,
                    call.outcome,
                    call.notes,
                    email_agent.agent_name if email_agent else "Isabella",
                )
        except Exception as e:
            logger.error(f"[BG] Email dispatch failed: {e}", exc_info=True)

        if ws_manager and campaign_id:
            try:
                await ws_manager.broadcast(campaign_id, {
                    "event": "call_updated",
                    "call_id": call_id,
                    "outcome": call.outcome,
                    "sentiment": call.sentiment,
                })
            except Exception:
                pass


async def _verify_retell_signature(request: Request, raw_body: bytes):
    secret = os.getenv("RETELL_WEBHOOK_SECRET", "")
    if not secret:
        logger.warning("RETELL_WEBHOOK_SECRET not set — webhook signature verification skipped!")
        return
    sig = request.headers.get("x-retell-signature", "")
    if not sig:
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")


@router.post("/retell")
async def retell_webhook(request: Request, background_tasks: BackgroundTasks, session: Session = Depends(get_session)):
    raw_body = await request.body()
    await _verify_retell_signature(request, raw_body)
    body = json.loads(raw_body)
    event = body.get("event", "")
    call_data = body.get("call", {})
    retell_call_id = call_data.get("call_id", "")
    call_type_retell = call_data.get("call_type", "outbound_api")

    logger.info(f"[WHv6] event={event} call_id={retell_call_id} type={call_type_retell}")
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

    # ── call_ended — save metadata only, analysis runs on call_analyzed ──────
    elif event == "call_ended":
        recording_url = call_data.get("recording_url")
        duration_ms = call_data.get("duration_ms") or call_data.get("call_length_ms") or 0
        start_ts = call_data.get("start_timestamp")
        end_ts = call_data.get("end_timestamp")
        transcript = call_data.get("transcript", "") or ""

        logger.info(f"[WEBHOOK] call_ended: call_id={call.id} duration_ms={duration_ms} recording={bool(recording_url)}")

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
        session.add(call)
        session.commit()
        logger.info(f"[WEBHOOK] call_ended saved call_id={call.id}")

    # ── call_analyzed — save metadata immediately, heavy work in background ──────
    elif event == "call_analyzed":
        transcript = call_data.get("transcript", "") or ""
        recording_url = call_data.get("recording_url")
        duration_ms = call_data.get("duration_ms") or call_data.get("call_length_ms") or 0
        start_ts = call_data.get("start_timestamp")
        end_ts = call_data.get("end_timestamp")
        call_analysis = call_data.get("call_analysis") or {}
        in_voicemail = call_analysis.get("in_voicemail", False)

        logger.info(
            f"[WEBHOOK] call_analyzed: call_id={call.id} transcript_len={len(transcript)} "
            f"voicemail={in_voicemail} recording={bool(recording_url)}"
        )

        # Save metadata now so Retell gets 200 quickly (prevents duplicate retries)
        call.status = "ended"
        call.call_type = "inbound" if call_type_retell == "inbound" else "outbound"
        if end_ts:
            call.ended_at = datetime.fromtimestamp(end_ts / 1000)
        if start_ts:
            call.started_at = datetime.fromtimestamp(start_ts / 1000)
        if transcript:
            call.raw_transcript = transcript
        if recording_url:
            call.recording_url = recording_url
        if duration_ms:
            call.duration_seconds = int(duration_ms / 1000)
        session.add(call)
        session.commit()

        # Schedule Claude analysis + CRM in background — Retell gets 200 immediately
        background_tasks.add_task(
            _bg_analyze_and_sync,
            call.id, transcript, in_voicemail, call.organization_id,
            call.prospect_id, call.campaign_id, call.duration_seconds or 0,
        )

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
        call.status = "ended"
        call.outcome = "no_answer"
        call.ended_at = datetime.utcnow()
        call.notes = f"No se pudo conectar: {disconnect_reason}" if disconnect_reason else "Llamada no conectada"
        session.add(call)
        if call.prospect_id:
            prospect = session.get(Prospect, call.prospect_id)
            if prospect:
                prospect.status = "no_answer"
                session.add(prospect)
        if call.campaign_id:
            campaign = session.get(Campaign, call.campaign_id)
            if campaign:
                campaign.total_calls += 1
                campaign.failed += 1
                session.add(campaign)
        session.commit()

    return {"ok": True}
