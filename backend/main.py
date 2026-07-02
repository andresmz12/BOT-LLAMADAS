import os
import json
import time
import asyncio
import logging
import threading
from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, Request, Response, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import create_db_and_tables, run_migrations, seed_initial_data, engine
from routes import agents, campaigns, prospects, calls, stats, webhook, settings, leads
from routes import auth, admin
from routes import demo
from routes import whatsapp_webhook
from routes import whatsapp
from routes import team
from routes import lead_hunter
from routes import marketing
from routes import webhook as webhook_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Health metrics — tracked in-process with a rolling 60-second window
# ---------------------------------------------------------------------------
_health_lock = threading.Lock()
# deque with maxlen caps memory; popleft() is O(1) vs list.pop(0) O(n)
_request_timestamps: deque[float] = deque(maxlen=6000)
_error_timestamps: deque[float] = deque(maxlen=6000)
_consecutive_failures = 0


class HealthMetricsMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        global _consecutive_failures
        response: Response = await call_next(request)
        now = time.monotonic()
        cutoff = now - 60.0
        with _health_lock:
            _request_timestamps.append(now)
            while _request_timestamps and _request_timestamps[0] < cutoff:
                _request_timestamps.popleft()
            if response.status_code >= 500:
                _error_timestamps.append(now)
                _consecutive_failures += 1
            else:
                _consecutive_failures = 0
            while _error_timestamps and _error_timestamps[0] < cutoff:
                _error_timestamps.popleft()
        return response


def _compute_error_rate() -> float:
    cutoff = time.monotonic() - 60.0
    with _health_lock:
        total = sum(1 for t in _request_timestamps if t >= cutoff)
        errors = sum(1 for t in _error_timestamps if t >= cutoff)
    if total == 0:
        return 0.0
    return round(errors / total * 100, 2)


class WebSocketManager:
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(self, campaign_id: int, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(campaign_id, []).append(ws)

    def disconnect(self, campaign_id: int, ws: WebSocket):
        conns = self.connections.get(campaign_id)
        if conns:
            try:
                conns.remove(ws)
            except ValueError:
                pass
            if not conns:
                del self.connections[campaign_id]

    async def broadcast(self, campaign_id: int, data: dict):
        dead = []
        for ws in self.connections.get(campaign_id, []):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        if dead:
            conns = self.connections.get(campaign_id, [])
            for ws in dead:
                try:
                    conns.remove(ws)
                except ValueError:
                    pass
            if not conns:
                self.connections.pop(campaign_id, None)


ws_manager = WebSocketManager()
webhook_module.ws_manager = ws_manager


def _maybe_complete_sequence(session, sequence_id: int) -> None:
    """Mark an EmailSequence as completed once every one of its steps has left status='pending'."""
    if not sequence_id:
        return
    from models import EmailSequence as _Seq, ScheduledEmailSend as _Job
    from sqlmodel import select as _sel3
    seq = session.get(_Seq, sequence_id)
    if not seq or seq.status in ("completed", "cancelled"):
        return
    steps = session.exec(_sel3(_Job).where(_Job.sequence_id == sequence_id)).all()
    if steps and all(st.status in ("done", "failed", "cancelled") for st in steps):
        seq.status = "completed"
        session.add(seq)


async def _run_scheduled_email(job_id: int):
    """Execute a scheduled email bulk send job."""
    from sqlmodel import Session as _S
    from models import ScheduledEmailSend as _EmailJob, Organization as _Org, Prospect as _Prospect, EmailSendLog as _Log, Campaign as _Campaign
    from sqlmodel import select as _sel
    import asyncio as _asyncio
    try:
        with _S(engine) as s:
            job = s.get(_EmailJob, job_id)
            if not job or job.status != "running":
                logger.info(f"[Scheduler] Email job {job_id} skipped — status={job.status if job else 'not found'}")
                return
            org = s.get(_Org, job.organization_id)
            if not org:
                job.status = "failed"
                job.error = "Organización no encontrada"
                s.add(job); _maybe_complete_sequence(s, job.sequence_id); s.commit(); return
            if not org.is_active:
                job.status = "failed"
                job.error = "Organización inactiva"
                s.add(job); _maybe_complete_sequence(s, job.sequence_id); s.commit(); return
            if job.campaign_id:
                campaign = s.get(_Campaign, job.campaign_id)
                if campaign and campaign.status == "paused":
                    job.status = "failed"
                    job.error = "Campaña pausada"
                    s.add(job); _maybe_complete_sequence(s, job.sequence_id); s.commit(); return

            api_key = (org.sendgrid_api_key or "").strip() or __import__("os").getenv("SENDGRID_API_KEY", "")
            if not api_key:
                job.status = "failed"; job.error = "Sin API key"
                s.add(job); _maybe_complete_sequence(s, job.sequence_id); s.commit(); return

            import json, base64 as _b64
            from datetime import datetime as _dt
            from services.sendgrid_service import _fill, _build_html, DEFAULT_SUBJECT
            from routes.settings import _unsub_url
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail, Attachment, FileContent, FileName, FileType, Disposition, CustomArg

            query = _sel(_Prospect).where(
                _Prospect.organization_id == job.organization_id,
                _Prospect.email.is_not(None),
                _Prospect.email != "",
                _Prospect.email_unsubscribed == False,  # noqa: E712
            )
            if job.email_list_id:
                query = query.where(_Prospect.email_list_id == job.email_list_id)
            elif job.email_only:
                query = query.where(_Prospect.campaign_id == None)  # noqa: E711
            elif job.campaign_id:
                query = query.where(_Prospect.campaign_id == job.campaign_id)
            all_prospects = s.exec(query).all()
            # Deduplicate by email (same as immediate send)
            seen_emails: set[str] = set()
            prospects = []
            for p in all_prospects:
                key = (p.email or "").strip().lower()
                if key and key not in seen_emails:
                    seen_emails.add(key)
                    prospects.append(p)

            templates = {}
            if org.email_templates:
                try: templates = json.loads(org.email_templates)
                except Exception: pass
            tmpl = templates.get(job.template_key, {})
            att_b64 = tmpl.get("attachment_b64") or ""
            att_name = tmpl.get("attachment_name") or ""
            if not att_b64 and org.email_attachment and org.email_attachment_name:
                att_b64 = _b64.b64encode(org.email_attachment).decode()
                att_name = org.email_attachment_name

            from_email = (org.email_from or "").strip() or __import__("os").getenv("SENDGRID_FROM_EMAIL", "noreply@example.com")
            from_name = (org.email_from_name or "").strip() or "ZyraVoice"
            delay_s = (org.email_send_delay_ms or 0) / 1000.0
            sg = SendGridAPIClient(api_key)
            sent = skipped = 0
            errors = []

            for prospect in prospects:
                try:
                    unsub = _unsub_url(prospect.id, org.id)
                    tmpl_vars = {
                        "nombre": prospect.name or "", "empresa": prospect.company or "",
                        "agente": from_name, "resumen": "", "telefono": prospect.phone or "",
                        "fecha": _dt.utcnow().strftime("%d/%m/%Y"),
                    }
                    subject = _fill(job.subject_override or tmpl.get("subject") or DEFAULT_SUBJECT.get(job.template_key, "Mensaje de ZyraVoice"), tmpl_vars)
                    color = tmpl.get("color") or "#4F46E5"
                    greeting = _fill(tmpl.get("greeting") or f"Estimado/a {tmpl_vars['nombre']},", tmpl_vars)
                    body_text = _fill(job.body_override or tmpl.get("body") or "", tmpl_vars)
                    signature = _fill(tmpl.get("signature") or f"El equipo de {from_name}", tmpl_vars)
                    html_body = _build_html(color, greeting, body_text, tmpl.get("cta_text") or "", tmpl.get("cta_url") or "", signature, unsubscribe_url=unsub,
                                             cta_text_2=tmpl.get("cta_text_2") or "", cta_url_2=tmpl.get("cta_url_2") or "")
                    message = Mail(from_email=(from_email, from_name), to_emails=prospect.email, subject=subject, html_content=html_body)
                    message.custom_arg = [CustomArg(key="org_id", value=str(org.id)), CustomArg(key="template_key", value=job.template_key)]
                    if att_b64 and att_name:
                        ext = att_name.rsplit(".", 1)[-1].lower()
                        mime = "application/pdf" if ext == "pdf" else f"image/{ext}"
                        message.attachment = Attachment(FileContent(att_b64), FileName(att_name), FileType(mime), Disposition("attachment"))
                    sg.send(message)
                    prospect.last_email_sent_at = _dt.utcnow()
                    prospect.email_send_count = (prospect.email_send_count or 0) + 1
                    s.add(prospect)
                    sent += 1
                    if delay_s > 0:
                        await _asyncio.sleep(delay_s)
                except Exception as ex:
                    errors.append({"email": prospect.email, "error": str(ex)[:80]})
                    skipped += 1

            s.commit()
            campaign_name = None
            if job.campaign_id:
                from models import Campaign as _Campaign
                _camp = s.get(_Campaign, job.campaign_id)
                campaign_name = _camp.name if _camp else None
            template_subject = tmpl.get("subject") or DEFAULT_SUBJECT.get(job.template_key, "")
            sent_details_list = [{"name": p.name or "", "email": p.email} for p in prospects if p.email]
            log_entry = _Log(
                organization_id=job.organization_id, template_key=job.template_key,
                template_subject=template_subject, campaign_id=job.campaign_id,
                campaign_name=campaign_name, total_sent=sent, total_skipped=skipped,
                total_errors=len(errors), error_details=json.dumps(errors) if errors else None,
                initiated_by=job.initiated_by, source_email_only=job.email_only,
                source_email_list_id=job.email_list_id,
                sent_details=json.dumps(sent_details_list) if sent_details_list else None,
            )
            s.add(log_entry)
            job.status = "done"
            s.add(job)
            _maybe_complete_sequence(s, job.sequence_id)
            s.commit()
            logger.info(f"[Scheduler] Email job {job_id} done: sent={sent} errors={len(errors)}")
    except Exception as e:
        logger.error(f"[Scheduler] Email job {job_id} failed: {e}", exc_info=True)
        try:
            from sqlmodel import Session as _S2
            with _S2(engine) as s2:
                j = s2.get(__import__("models", fromlist=["ScheduledEmailSend"]).ScheduledEmailSend, job_id)
                if j:
                    j.status = "failed"; j.error = str(e)[:200]; s2.add(j)
                    _maybe_complete_sequence(s2, j.sequence_id)
                    s2.commit()
        except Exception: pass


async def _campaign_scheduler():
    """Poll every 30s: auto-start scheduled campaigns and fire scheduled email jobs."""
    import asyncio as _asyncio
    from datetime import datetime as _dt, timezone as _tz
    from sqlmodel import Session as _S, select as _sel
    from models import Campaign as _Campaign, ScheduledEmailSend as _EmailJob
    from services import call_orchestrator as _orch

    while True:
        await _asyncio.sleep(30)
        now_utc = _dt.utcnow()

        # --- Call campaigns ---
        try:
            with _S(engine) as s:
                due = s.exec(
                    _sel(_Campaign).where(
                        _Campaign.status == "scheduled",
                        _Campaign.scheduled_start_at <= _dt.utcnow(),
                    )
                ).all()
                for campaign in due:
                    campaign.status = "running"
                    s.add(campaign)
                    s.commit()
                    task = _asyncio.create_task(_orch.start_campaign(campaign.id))
                    _orch.running_tasks[campaign.id] = task
                    logger.info(f"[Scheduler] Auto-started campaign {campaign.id} '{campaign.name}'")
        except Exception as e:
            logger.error(f"[Scheduler] Campaign error: {e}")

        # --- Scheduled email jobs ---
        try:
            with _S(engine) as s:
                due_emails = s.exec(
                    _sel(_EmailJob)
                    .where(
                        _EmailJob.status == "pending",
                        _EmailJob.scheduled_at <= now_utc,
                    )
                    # Earlier-due jobs are claimed/fired first so sequence steps that
                    # both became due in the same poll keep their intended order.
                    .order_by(_EmailJob.scheduled_at)
                ).all()
                for job in due_emails:
                    # Atomic claim: only proceed if we can change status from pending→running
                    # This prevents double-execution when two backend instances overlap during deploy
                    from sqlalchemy import update as _upd
                    result = s.execute(
                        _upd(_EmailJob)
                        .where(_EmailJob.id == job.id, _EmailJob.status == "pending")
                        .values(status="running")
                    )
                    s.commit()
                    if result.rowcount == 0:
                        # Another instance already claimed this job
                        logger.info(f"[Scheduler] Email job {job.id} already claimed by another instance, skipping")
                        continue
                    _asyncio.create_task(_run_scheduled_email(job.id))
                    logger.info(f"[Scheduler] Firing email job {job.id} org={job.organization_id}")
        except Exception as e:
            logger.error(f"[Scheduler] Email job error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== ZYRAVOICE BACKEND v6 STARTING ===")

    def _init_db():
        try:
            create_db_and_tables()
            run_migrations()
            seed_initial_data()
            logger.info("Database initialized")
        except Exception as e:
            logger.error(f"Database initialization error: {e}")

        # Recover prospects stuck in "calling" from a previous crashed/restarted session
        try:
            from sqlmodel import Session as _S, select as _sel
            from models import Prospect as _Prospect
            with _S(engine) as s:
                stuck = s.exec(_sel(_Prospect).where(_Prospect.status == "calling")).all()
                for p in stuck:
                    p.status = "pending"
                    s.add(p)
                if stuck:
                    s.commit()
                    logger.info(f"[Startup] Reset {len(stuck)} stuck 'calling' prospect(s) → 'pending'")
        except Exception as e:
            logger.error(f"[Startup] Failed to recover stuck prospects: {e}")

    # Run all blocking DB work in a thread so the event loop stays responsive
    # for Railway health checks while migrations execute against PostgreSQL
    await asyncio.to_thread(_init_db)

    if not os.getenv("RETELL_WEBHOOK_SECRET"):
        logger.warning("⚠️  RETELL_WEBHOOK_SECRET not set — webhook signature verification is DISABLED")
    if not os.getenv("JWT_SECRET"):
        logger.warning("⚠️  JWT_SECRET not set — using insecure development key")
    if not os.getenv("SUPERADMIN_PASSWORD"):
        logger.warning("⚠️  SUPERADMIN_PASSWORD not set — using default hardcoded password, CHANGE THIS IN PRODUCTION")

    # Resume bulk email sends that were running/paused/resuming when the backend
    # last stopped. A claim based purely on status is NOT enough on Railway: during
    # a rolling deploy the OLD instance can still be alive with a live in-process
    # send task while the NEW instance runs this startup block — the job's row
    # legitimately says status="running" because it genuinely still is. Claiming it
    # anyway (as an earlier version of this fix did) launches a second sender over
    # the same prospect list and double-sends, because the old instance's task has
    # no way to know it's been "taken over".
    #
    # Instead we use updated_at as a heartbeat: the send loop touches it after
    # every single prospect (routes/settings.py _run_bulk_send_job_inner). A row
    # only counts as orphaned if it hasn't been touched in STALE_AFTER — long
    # enough that a genuinely live process would have updated it again by now.
    # Freshly-touched rows are left alone (a live process — this instance's
    # predecessor or a still-running replica — owns them). This also self-heals a
    # job that gets stuck in the transient "resuming" marker below if a crash
    # lands between its two commits: it simply looks orphaned on a later restart.
    try:
        from datetime import timedelta as _timedelta
        from sqlmodel import Session as _S2, select as _sel2
        from sqlalchemy import update as _bulk_upd
        from models import BulkEmailJob as _BulkEmailJob, Organization as _Org
        from routes.settings import _run_bulk_send_job as _resume_bulk_job
        STALE_AFTER = _timedelta(seconds=120)
        with _S2(engine) as s:
            cutoff = datetime.utcnow() - STALE_AFTER
            candidate_statuses = ["running", "paused", "resuming"]
            stuck_jobs = s.exec(
                _sel2(_BulkEmailJob).where(_BulkEmailJob.status.in_(candidate_statuses))
            ).all()
            for j in stuck_jobs:
                if j.updated_at and j.updated_at > cutoff:
                    logger.info(f"[Startup] Bulk email job {j.id} updated recently ({j.updated_at}); assuming a live process still owns it, not claiming")
                    continue
                try:
                    # Re-check staleness inside the WHERE clause itself so a job
                    # touched between the read above and this UPDATE loses the
                    # claim instead of being stolen from its live owner.
                    claim = s.execute(
                        _bulk_upd(_BulkEmailJob)
                        .where(
                            _BulkEmailJob.id == j.id,
                            _BulkEmailJob.status.in_(candidate_statuses),
                            _BulkEmailJob.updated_at <= cutoff,
                        )
                        .values(status="resuming", updated_at=datetime.utcnow())
                    )
                    s.commit()
                    if claim.rowcount == 0:
                        logger.info(f"[Startup] Bulk email job {j.id} claimed or touched by another process, skipping")
                        continue
                    org = s.get(_Org, j.organization_id)
                    api_key = (org.sendgrid_api_key or "").strip() or os.getenv("SENDGRID_API_KEY", "") if org else ""
                    if api_key and j.remaining and j.remaining != "[]":
                        s.execute(
                            _bulk_upd(_BulkEmailJob).where(_BulkEmailJob.id == j.id)
                            .values(status="running", updated_at=datetime.utcnow())
                        )
                        s.commit()
                        asyncio.create_task(_resume_bulk_job(job_id=str(j.id), api_key=api_key))
                        logger.info(f"[Startup] Resumed bulk email job {j.id} (org={j.organization_id})")
                    else:
                        s.execute(
                            _bulk_upd(_BulkEmailJob).where(_BulkEmailJob.id == j.id)
                            .values(status="error", updated_at=datetime.utcnow())
                        )
                        s.commit()
                except Exception as job_err:
                    logger.error(f"[Startup] Failed to recover bulk email job {j.id}: {job_err}")
    except Exception as e:
        logger.error(f"[Startup] Failed to resume bulk email jobs: {e}")

    # Recover scheduled-email jobs left in "running" by a crash/restart mid-send —
    # reset to "pending" so the next scheduler poll re-claims and re-runs them.
    try:
        from sqlmodel import Session as _S3, select as _sel3
        from models import ScheduledEmailSend as _EmailJob3
        with _S3(engine) as s:
            orphaned = s.exec(
                _sel3(_EmailJob3).where(_EmailJob3.status == "running")
            ).all()
            for j in orphaned:
                j.status = "pending"
                s.add(j)
            if orphaned:
                s.commit()
                logger.info(f"[Startup] Reset {len(orphaned)} orphaned scheduled email job(s) 'running' → 'pending'")
    except Exception as e:
        logger.error(f"[Startup] Failed to recover orphaned scheduled email jobs: {e}")

    scheduler = asyncio.create_task(_campaign_scheduler())
    yield
    scheduler.cancel()


app = FastAPI(title="Voice Agent API", lifespan=lifespan, docs_url=None, redoc_url=None)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)
app.add_middleware(HealthMetricsMiddleware)

app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(demo.router)
app.include_router(agents.router)
app.include_router(campaigns.router)
app.include_router(prospects.router)
app.include_router(calls.router)
app.include_router(stats.router)
app.include_router(webhook.router)
app.include_router(whatsapp_webhook.router)
app.include_router(whatsapp.router)
app.include_router(team.router)
app.include_router(settings.router)
app.include_router(leads.router)
app.include_router(lead_hunter.router)
app.include_router(marketing.router)


@app.websocket("/ws/{campaign_id}")
async def websocket_endpoint(websocket: WebSocket, campaign_id: int, token: str = ""):
    from services.auth import decode_token
    if not token:
        await websocket.close(code=4001)
        return
    try:
        decode_token(token)
    except ValueError:
        await websocket.close(code=4001)
        return
    await ws_manager.connect(campaign_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(campaign_id, websocket)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/health")
def api_health():
    import psutil
    from sqlalchemy import text

    # Database connectivity
    db_connected = False
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        pass

    # System metrics — read container cgroup memory (accurate in Railway/Docker),
    # falling back to host /proc/meminfo only if cgroup files are unavailable.
    def _cgroup_mem_pct() -> float:
        # cgroups v2 (modern kernels, Docker 20+, Railway)
        try:
            with open("/sys/fs/cgroup/memory.current") as f:
                used = int(f.read().strip())
            with open("/sys/fs/cgroup/memory.max") as f:
                val = f.read().strip()
            if val != "max":
                limit = int(val)
                if limit < 2 ** 62:
                    return round(used / limit * 100, 2)
        except Exception:
            pass
        # cgroups v1
        try:
            with open("/sys/fs/cgroup/memory/memory.usage_in_bytes") as f:
                used = int(f.read().strip())
            with open("/sys/fs/cgroup/memory/memory.limit_in_bytes") as f:
                limit = int(f.read().strip())
            if limit < 2 ** 62:
                return round(used / limit * 100, 2)
        except Exception:
            pass
        # Fallback: host memory (inaccurate inside shared containers)
        vm = psutil.virtual_memory()
        return round(vm.used / vm.total * 100, 2)

    mem_pct = _cgroup_mem_pct()
    cpu_pct = round(os.getloadavg()[0] / os.cpu_count() * 100, 2)

    with _health_lock:
        consec = _consecutive_failures

    return {
        "status": "ok",
        "app": "Bot Llamadas",
        "errorRate": _compute_error_rate(),
        "consecutiveFailures": consec,
        "databaseConnected": db_connected,
        "memoryUsage": mem_pct,
        "cpuUsage": cpu_pct,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
