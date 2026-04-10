import os
from sqlmodel import SQLModel, create_engine, Session, select
from models import AgentConfig

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./calls.db")
engine = create_engine(DATABASE_URL, echo=False, connect_args={"check_same_thread": False})


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


def seed_default_agent():
    with Session(engine) as session:
        existing = session.exec(select(AgentConfig)).first()
        if existing:
            return
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
        )
        session.add(agent)
        session.commit()
