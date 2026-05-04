import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
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

    # Run blocking DB work in a thread — keeps event loop responsive
    # for Railway health checks while migrations run against PostgreSQL
    await asyncio.to_thread(_init_db)

    if not os.getenv("RETELL_WEBHOOK_SECRET"):
        logger.warning("⚠️  RETELL_WEBHOOK_SECRET not set — webhook signature verification is DISABLED")
    if not os.getenv("JWT_SECRET"):
        logger.warning("⚠️  JWT_SECRET not set — using insecure development key")
    yield


app = FastAPI(title="Voice Agent API", lifespan=lifespan)

_raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
_allowed_origins = [o.strip() for o in _raw_origins.split(",")] if _raw_origins != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def websocket_endpoint(websocket: WebSocket, campaign_id: int):
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
        return {"db": "ok", "org_columns_missing": missing, "migration_needed": bool(missing)}
    except Exception as e:
        return {"db": "error", "detail": str(e)}
