import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from database import create_db_and_tables, run_migrations, seed_initial_data, engine
from routes import agents, campaigns, prospects, calls, stats, webhook, settings, leads
from routes import auth, admin
from routes import demo
from routes import whatsapp_webhook
from routes import whatsapp
from routes import team
from routes import webhook as webhook_module

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WebSocketManager:
    def __init__(self):
        self.connections: dict[int, list[WebSocket]] = {}

    async def connect(self, campaign_id: int, ws: WebSocket):
        await ws.accept()
        self.connections.setdefault(campaign_id, []).append(ws)

    def disconnect(self, campaign_id: int, ws: WebSocket):
        if campaign_id in self.connections:
            try:
                self.connections[campaign_id].remove(ws)
            except ValueError:
                pass

    async def broadcast(self, campaign_id: int, data: dict):
        dead = []
        for ws in self.connections.get(campaign_id, []):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.connections[campaign_id].remove(ws)


ws_manager = WebSocketManager()
webhook_module.ws_manager = ws_manager


async def _campaign_scheduler():
    """Poll every 30s and auto-start campaigns whose scheduled_start_at has arrived."""
    import asyncio as _asyncio
    from datetime import datetime as _dt, timezone as _tz
    from sqlmodel import Session as _S, select as _sel
    from models import Campaign as _Campaign
    from services import call_orchestrator as _orch

    while True:
        await _asyncio.sleep(30)
        try:
            with _S(engine) as s:
                due = s.exec(
                    _sel(_Campaign).where(
                        _Campaign.status == "scheduled",
                        _Campaign.scheduled_start_at <= _dt.now(_tz.utc),
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
            logger.error(f"[Scheduler] Error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== ZYRAVOICE BACKEND v6 STARTING ===")
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
    if not os.getenv("RETELL_WEBHOOK_SECRET"):
        logger.warning("⚠️  RETELL_WEBHOOK_SECRET not set — webhook signature verification is DISABLED")
    if not os.getenv("JWT_SECRET"):
        logger.warning("⚠️  JWT_SECRET not set — using insecure development key")
    if not os.getenv("SUPERADMIN_PASSWORD"):
        logger.warning("⚠️  SUPERADMIN_PASSWORD not set — using default hardcoded password, CHANGE THIS IN PRODUCTION")

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


@app.get("/health/db")
def health_db():
    from sqlalchemy import text, inspect as sa_inspect
    try:
        insp = sa_inspect(engine)
        org_cols = {c["name"] for c in insp.get_columns("organization")}
        required = {"crm_api_key", "crm_board_or_list_id", "crm_extra_config"}
        missing = list(required - org_cols)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"db": "ok", "migration_needed": bool(missing)}
    except Exception:
        return {"db": "error"}
