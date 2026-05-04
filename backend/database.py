import os
from sqlmodel import SQLModel, create_engine, Session, select
from models import AgentConfig, Organization, User, WebhookLog, EmailSendLog  # noqa: F401 — ensures table is registered

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./calls.db")
# Railway PostgreSQL URLs start with "postgres://" but SQLAlchemy requires "postgresql://"
DATABASE_URL = _raw_url.replace("postgres://", "postgresql://", 1)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)

RETELL_AGENT_ID_DEFAULT = "agent_1499fc3598510000648e68461e"
RETELL_LLM_ID_DEFAULT = "llm_7bd5d1428d3903644ab5152e681d"


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def run_migrations():
    """Add missing columns to existing tables (safe to run on every startup)."""
    import logging
    from sqlalchemy import text, inspect as sa_inspect
    log = logging.getLogger(__name__)
    try:
        insp = sa_inspect(engine)
        tables = insp.get_table_names()

        if "agentconfig" in tables:
            agent_cols = {c["name"] for c in insp.get_columns("agentconfig")}
            new_cols = {
                "retell_knowledge_base_id": "VARCHAR(255)",
                "outbound_system_prompt": "TEXT",
                "outbound_first_message": "TEXT",
                "inbound_enabled": "BOOLEAN DEFAULT FALSE",
                "inbound_system_prompt": "TEXT",
                "inbound_first_message": "TEXT",
                "inbound_retell_agent_id": "VARCHAR(255)",
                "inbound_retell_llm_id": "VARCHAR(255)",
                "voicemail_message": "TEXT",
                "call_objective": "VARCHAR(100)",
                "target_audience": "TEXT",
                "custom_objections": "TEXT",
            }
            with engine.begin() as conn:
                for col, col_type in new_cols.items():
                    if col not in agent_cols:
                        conn.execute(text(f"ALTER TABLE agentconfig ADD COLUMN {col} {col_type}"))
                        log.info(f"Migration: added agentconfig.{col}")

        if "prospect" in tables:
            prospect_cols = {c["name"] for c in insp.get_columns("prospect")}
            prospect_new = {
                "email": "VARCHAR(255)",
                "website": "VARCHAR(500)",
                "place_id": "VARCHAR(255)",
                "last_review_at": "TIMESTAMP",
                "quality_score": "INTEGER",
                "email_unsubscribed": "BOOLEAN DEFAULT FALSE",
                "last_email_sent_at": "TIMESTAMP",
                "email_send_count": "INTEGER DEFAULT 0",
            }
            with engine.begin() as conn:
                for col, col_type in prospect_new.items():
                    if col not in prospect_cols:
                        conn.execute(text(f"ALTER TABLE prospect ADD COLUMN {col} {col_type}"))
                        log.info(f"Migration: added prospect.{col}")

        if "call" in tables:
            call_cols = {c["name"] for c in insp.get_columns("call")}
            with engine.begin() as conn:
                if "call_type" not in call_cols:
                    conn.execute(text("ALTER TABLE call ADD COLUMN call_type VARCHAR(50) DEFAULT 'outbound'"))
                    log.info("Migration: added call.call_type")
                if "organization_id" not in call_cols:
                    conn.execute(text("ALTER TABLE call ADD COLUMN organization_id INTEGER"))
                    log.info("Migration: added call.organization_id")

        if "campaign" in tables:
            camp_cols = {c["name"] for c in insp.get_columns("campaign")}
            with engine.begin() as conn:
                if "calls_per_minute" not in camp_cols:
                    conn.execute(text("ALTER TABLE campaign ADD COLUMN calls_per_minute INTEGER DEFAULT 10"))
                    log.info("Migration: added campaign.calls_per_minute")
                if "sequential_calls" not in camp_cols:
                    conn.execute(text("ALTER TABLE campaign ADD COLUMN sequential_calls BOOLEAN DEFAULT FALSE"))
                    log.info("Migration: added campaign.sequential_calls")
                if "scheduled_start_at" not in camp_cols:
                    conn.execute(text("ALTER TABLE campaign ADD COLUMN scheduled_start_at TIMESTAMP"))
                    log.info("Migration: added campaign.scheduled_start_at")

        if "organization" in tables:
            org_cols = {c["name"] for c in insp.get_columns("organization")}
            is_pg = not DATABASE_URL.startswith("sqlite")
            org_new = {
                "crm_webhook_url": "VARCHAR(500)",
                "crm_webhook_enabled": "BOOLEAN DEFAULT FALSE",
                "crm_webhook_secret": "VARCHAR(255)",
                "crm_type": "VARCHAR(100)",
                "crm_events": "TEXT DEFAULT '[\"call_ended\",\"interested\"]'",
                "crm_api_key": "VARCHAR(500)",
                "crm_board_or_list_id": "VARCHAR(255)",
                "crm_extra_config": "TEXT",
                "demo_calls_used": "INTEGER DEFAULT 0",
                "whatsapp_phone_number_id": "VARCHAR(255)",
                "whatsapp_access_token": "TEXT",
                "whatsapp_verify_token": "VARCHAR(255)",
                "whatsapp_enabled": "BOOLEAN DEFAULT FALSE",
                "apify_enabled": "BOOLEAN DEFAULT FALSE",
                "apify_api_token": "TEXT",
                "email_enabled": "BOOLEAN DEFAULT FALSE",
                "sendgrid_api_key": "TEXT",
                "email_from": "VARCHAR(255)",
                "email_from_name": "VARCHAR(255)",
                "email_send_on_interested": "BOOLEAN DEFAULT TRUE",
                "email_send_on_callback": "BOOLEAN DEFAULT FALSE",
                "email_send_on_voicemail": "BOOLEAN DEFAULT FALSE",
                "email_send_on_not_interested": "BOOLEAN DEFAULT FALSE",
                "email_templates": "TEXT",
                "email_attachment": "BYTEA" if is_pg else "BLOB",
                "email_attachment_name": "VARCHAR(255)",
                "email_send_delay_ms": "INTEGER DEFAULT 0",
            }
            with engine.begin() as conn:
                for col, col_type in org_new.items():
                    if col not in org_cols:
                        conn.execute(text(f"ALTER TABLE organization ADD COLUMN {col} {col_type}"))
                        log.info(f"Migration: added organization.{col}")

        # Migrate legacy "basic" plan → "pro"
        with engine.begin() as conn:
            conn.execute(text("UPDATE organization SET plan = 'pro' WHERE plan = 'basic'"))

        # Indexes for performance on frequently filtered columns
        is_pg = not DATABASE_URL.startswith("sqlite")
        if is_pg:
            indexes = [
                ("ix_call_organization_id",   "call",     "organization_id"),
                ("ix_call_campaign_id",        "call",     "campaign_id"),
                ("ix_prospect_organization_id","prospect", "organization_id"),
                ("ix_prospect_campaign_id",    "prospect", "campaign_id"),
                ("ix_campaign_organization_id","campaign", "organization_id"),
                ("ix_user_organization_id",    "user",     "organization_id"),
            ]
            with engine.begin() as conn:
                for idx_name, tbl, col in indexes:
                    conn.execute(text(
                        f"CREATE INDEX IF NOT EXISTS {idx_name} ON \"{tbl}\" ({col})"
                    ))

    except Exception as e:
        log.error(f"Migration FAILED: {e}", exc_info=True)


def get_session():
    with Session(engine) as session:
        yield session


def seed_initial_data():
    from services.auth import hash_password

    retell_agent_id = os.getenv("RETELL_AGENT_ID") or RETELL_AGENT_ID_DEFAULT
    retell_llm_id = os.getenv("RETELL_LLM_ID") or RETELL_LLM_ID_DEFAULT

    with Session(engine) as session:
        # 1. Default organization
        org = session.exec(select(Organization)).first()
        if not org:
            org = Organization(
                name="ISM Consulting Services",
                plan="pro",
                retell_api_key=os.getenv("RETELL_API_KEY", ""),
                retell_phone_number=os.getenv("RETELL_PHONE_NUMBER", ""),
                anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            )
            session.add(org)
            session.commit()
            session.refresh(org)

        # 2. Superadmin
        admin_email = os.getenv("SUPERADMIN_EMAIL", "admin@ismconsulting.com")
        admin_password = os.getenv("SUPERADMIN_PASSWORD", "ISMadmin2024!")
        admin = session.exec(select(User).where(User.email == admin_email)).first()
        if not admin:
            admin = User(
                email=admin_email,
                password_hash=hash_password(admin_password),
                full_name="Super Admin",
                role="superadmin",
                organization_id=org.id,
            )
            session.add(admin)
            session.commit()

        # 3. Default agent Isabella
        agent = session.exec(select(AgentConfig)).first()
        if not agent:
            agent = AgentConfig(
                name="Isabella - ISM Consulting",
                agent_name="Isabella",
                company_name="ISM Consulting Services",
                company_info=(
                    "ISM Consulting Services es una empresa especializada en servicios financieros "
                    "y empresariales para la comunidad hispana en Estados Unidos. Ayudamos a "
                    "inmigrantes y emprendedores a establecer y formalizar sus negocios, cumplir "
                    "con sus obligaciones fiscales y crecer financieramente de forma legal y segura."
                ),
                services=(
                    "- Formación de LLC desde $299 (Single-member y Multi-member)\n"
                    "- Obtención de ITIN desde $150\n"
                    "- Tax Return personal desde $99\n"
                    "- Tax Return negocio desde $199\n"
                    "- Registro FinCEN/BOI\n"
                    "- Contabilidad mensual desde $149/mes"
                ),
                instructions=(
                    "Habla siempre en español con tono cálido y profesional. "
                    "Preséntate al inicio de la llamada. Escucha primero la situación "
                    "del cliente antes de ofrecer servicios. Identifica su necesidad "
                    "principal y ofrece el servicio más adecuado. Intenta siempre "
                    "agendar una cita de seguimiento con un asesor humano."
                ),
                is_default=True,
                retell_agent_id=retell_agent_id,
                retell_llm_id=retell_llm_id,
                organization_id=org.id,
            )
            session.add(agent)
            session.commit()
        else:
            changed = False
            if not agent.retell_agent_id or not agent.retell_llm_id:
                agent.retell_agent_id = agent.retell_agent_id or retell_agent_id
                agent.retell_llm_id = agent.retell_llm_id or retell_llm_id
                changed = True
            if not agent.organization_id:
                agent.organization_id = org.id
                changed = True
            if changed:
                session.add(agent)
                session.commit()
