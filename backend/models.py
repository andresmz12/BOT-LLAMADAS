from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship


class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    logo_url: Optional[str] = None
    plan: str = Field(default="basic")  # free/basic/pro
    retell_api_key: str = Field(default="")
    retell_phone_number: str = Field(default="")
    anthropic_api_key: str = Field(default="")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    users: List["User"] = Relationship(back_populates="organization")


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True)
    password_hash: str
    full_name: str
    role: str = Field(default="agent")  # superadmin/admin/agent/viewer
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    organization: Optional[Organization] = Relationship(back_populates="users")


class AgentConfig(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    agent_name: str
    company_name: str
    company_info: str = Field(default="")
    services: str = Field(default="")
    instructions: str = Field(default="")
    language: str = Field(default="español")
    voice_id: Optional[str] = None
    max_call_duration: int = Field(default=180)
    is_default: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    retell_agent_id: Optional[str] = None
    retell_llm_id: Optional[str] = None
    first_message_override: Optional[str] = None
    voicemail_message: Optional[str] = None
    temperature: float = Field(default=0.4)
    inbound_enabled: bool = Field(default=False)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")

    campaigns: List["Campaign"] = Relationship(back_populates="agent_config")


class Campaign(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    status: str = Field(default="draft")  # draft/running/paused/completed
    agent_config_id: int = Field(foreign_key="agentconfig.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    total_calls: int = Field(default=0)
    answered: int = Field(default=0)
    voicemail: int = Field(default=0)
    interested: int = Field(default=0)
    appointments_scheduled: int = Field(default=0)
    failed: int = Field(default=0)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")

    agent_config: Optional[AgentConfig] = Relationship(back_populates="campaigns")
    prospects: List["Prospect"] = Relationship(back_populates="campaign")
    calls: List["Call"] = Relationship(back_populates="campaign")


class Prospect(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id")
    name: str
    phone: str
    company: Optional[str] = None
    status: str = Field(default="pending")
    call_attempts: int = Field(default=0)
    last_called_at: Optional[datetime] = None
    notes: Optional[str] = None
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")

    campaign: Optional[Campaign] = Relationship(back_populates="prospects")
    calls: List["Call"] = Relationship(back_populates="prospect")


class Call(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    prospect_id: Optional[int] = Field(default=None, foreign_key="prospect.id")
    campaign_id: Optional[int] = Field(default=None, foreign_key="campaign.id")
    vapi_call_id: str = Field(default="")
    status: str = Field(default="initiated")
    call_type: str = Field(default="outbound")  # outbound/inbound
    duration_seconds: Optional[int] = None
    recording_url: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    raw_transcript: Optional[str] = None
    client_said: Optional[str] = Field(default="[]")
    agent_said: Optional[str] = Field(default="[]")
    outcome: Optional[str] = None
    services_mentioned: Optional[str] = Field(default="[]")
    sentiment: Optional[str] = None
    appointment_scheduled: bool = Field(default=False)
    appointment_date: Optional[datetime] = None
    notes: Optional[str] = None
    is_demo: bool = Field(default=False)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")

    prospect: Optional[Prospect] = Relationship(back_populates="calls")
    campaign: Optional[Campaign] = Relationship(back_populates="calls")


class Settings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True)
    value: str = Field(default="")
