from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
import json


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

    agent_config: Optional[AgentConfig] = Relationship(back_populates="campaigns")
    prospects: List["Prospect"] = Relationship(back_populates="campaign")
    calls: List["Call"] = Relationship(back_populates="campaign")


class Prospect(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: int = Field(foreign_key="campaign.id")
    name: str
    phone: str
    company: Optional[str] = None
    status: str = Field(default="pending")  # pending/calling/answered/voicemail/failed/do_not_call
    call_attempts: int = Field(default=0)
    last_called_at: Optional[datetime] = None
    notes: Optional[str] = None

    campaign: Optional[Campaign] = Relationship(back_populates="prospects")
    calls: List["Call"] = Relationship(back_populates="prospect")


class Call(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    prospect_id: int = Field(foreign_key="prospect.id")
    campaign_id: int = Field(foreign_key="campaign.id")
    vapi_call_id: str = Field(default="")
    status: str = Field(default="initiated")
    duration_seconds: Optional[int] = None
    recording_url: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    ended_at: Optional[datetime] = None
    raw_transcript: Optional[str] = None
    client_said: Optional[str] = Field(default="[]")   # JSON string
    agent_said: Optional[str] = Field(default="[]")    # JSON string
    outcome: Optional[str] = None
    services_mentioned: Optional[str] = Field(default="[]")  # JSON string
    sentiment: Optional[str] = None
    appointment_scheduled: bool = Field(default=False)
    appointment_date: Optional[datetime] = None
    notes: Optional[str] = None
    is_demo: bool = Field(default=False)

    prospect: Optional[Prospect] = Relationship(back_populates="calls")
    campaign: Optional[Campaign] = Relationship(back_populates="calls")


class Settings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True)
    value: str = Field(default="")
