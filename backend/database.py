import os
from sqlmodel import SQLModel, create_engine, Session, select
from models import AgentConfig, Organization, User

_raw_url = os.getenv("DATABASE_URL", "sqlite:///./calls.db")
# Railway PostgreSQL URLs start with "postgres://" but SQLAlchemy requires "postgresql://"
DATABASE_URL = _raw_url.replace("postgres://", "postgresql://", 1)

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, echo=False, connect_args=_connect_args)

RETELL_AGENT_ID_DEFAULT = "agent_1499fc3598510000648e68461e"
RETELL_LLM_ID_DEFAULT = "llm_7bd5d1428d3903644ab5152e681d"


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


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
        admin = session.exec(select(User).where(User.email == "admin@ismconsulting.com")).first()
        if not admin:
            admin = User(
                email="admin@ismconsulting.com",
                password_hash=hash_password("ISMadmin2024!"),
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
