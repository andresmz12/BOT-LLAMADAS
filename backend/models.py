from typing import Optional, List
from datetime import datetime
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy import Column, LargeBinary


class Organization(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    logo_url: Optional[str] = None
    plan: str = Field(default="pro")  # free/pro
    retell_api_key: str = Field(default="")
    retell_phone_number: str = Field(default="")
    anthropic_api_key: str = Field(default="")
    is_active: bool = Field(default=True)
    crm_webhook_url: Optional[str] = None
    crm_webhook_enabled: bool = Field(default=False)
    crm_webhook_secret: Optional[str] = None
    crm_type: Optional[str] = None
    crm_events: str = Field(default='["call_ended","interested"]')
    crm_api_key: Optional[str] = None
    crm_board_or_list_id: Optional[str] = None
    crm_extra_config: Optional[str] = None  # JSON string, e.g. {"instance_url": "https://..."}
    demo_calls_used: int = Field(default=0)
    whatsapp_phone_number_id: Optional[str] = None
    whatsapp_access_token: Optional[str] = None
    whatsapp_verify_token: Optional[str] = None
    whatsapp_enabled: bool = Field(default=False)
    apify_enabled: bool = Field(default=False)
    apify_api_token: Optional[str] = None
    # Email marketing
    email_enabled: bool = Field(default=False)
    sendgrid_api_key: Optional[str] = None
    email_from: Optional[str] = None
    email_from_name: Optional[str] = None
    email_send_on_interested: bool = Field(default=True)
    email_send_on_callback: bool = Field(default=False)
    email_send_on_voicemail: bool = Field(default=False)
    email_send_on_not_interested: bool = Field(default=False)
    email_templates: Optional[str] = None
    email_attachment: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    email_attachment_name: Optional[str] = None
    email_send_delay_ms: int = Field(default=0)
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
    outbound_system_prompt: Optional[str] = None
    outbound_first_message: Optional[str] = None
    inbound_enabled: bool = Field(default=False)
    inbound_system_prompt: Optional[str] = None
    inbound_first_message: Optional[str] = None
    inbound_retell_agent_id: Optional[str] = None
    inbound_retell_llm_id: Optional[str] = None
    retell_knowledge_base_id: Optional[str] = None
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    call_objective: Optional[str] = None
    target_audience: Optional[str] = None
    custom_objections: Optional[str] = None

    campaigns: List["Campaign"] = Relationship(back_populates="agent_config")


class Campaign(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    description: Optional[str] = None
    status: str = Field(default="draft")  # draft/scheduled/running/paused/completed
    agent_config_id: int = Field(foreign_key="agentconfig.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    total_calls: int = Field(default=0)
    answered: int = Field(default=0)
    voicemail: int = Field(default=0)
    interested: int = Field(default=0)
    appointments_scheduled: int = Field(default=0)
    failed: int = Field(default=0)
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    calls_per_minute: int = Field(default=10)
    sequential_calls: bool = Field(default=False)
    scheduled_start_at: Optional[datetime] = Field(default=None)

    agent_config: Optional[AgentConfig] = Relationship(back_populates="campaigns")
    prospects: List["Prospect"] = Relationship(back_populates="campaign")
    calls: List["Call"] = Relationship(back_populates="campaign")


class EmailList(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Prospect(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    campaign_id: Optional[int] = Field(default=None, foreign_key="campaign.id")
    email_list_id: Optional[int] = Field(default=None, foreign_key="emaillist.id")
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company: Optional[str] = None
    status: str = Field(default="pending")
    call_attempts: int = Field(default=0)
    last_called_at: Optional[datetime] = None
    notes: Optional[str] = None
    organization_id: Optional[int] = Field(default=None, foreign_key="organization.id")
    # Apify-sourced enrichment fields
    website: Optional[str] = None
    place_id: Optional[str] = Field(default=None, index=True)
    last_review_at: Optional[datetime] = None
    quality_score: Optional[int] = None
    email_unsubscribed: bool = Field(default=False)
    last_email_sent_at: Optional[datetime] = None
    email_send_count: int = Field(default=0)

    campaign: Optional[Campaign] = Relationship(back_populates="prospects")
    calls: List["Call"] = Relationship(back_populates="prospect")


class Call(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    prospect_id: Optional[int] = Field(default=None, foreign_key="prospect.id")
    campaign_id: Optional[int] = Field(default=None, foreign_key="campaign.id")
    retell_call_id: str = Field(default="")
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


class WhatsAppConversation(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    wa_contact_id: str                  # número E.164 del contacto
    contact_name: Optional[str] = None
    status: str = Field(default="active")   # active | closed
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    messages: List["WhatsAppMessage"] = Relationship(back_populates="conversation")


class WhatsAppMessage(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    conversation_id: int = Field(foreign_key="whatsappconversation.id", index=True)
    organization_id: int = Field(foreign_key="organization.id", index=True)
    role: str                           # "user" | "assistant"
    content: str
    wa_message_id: Optional[str] = None     # ID de Meta (para dedup)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    conversation: Optional[WhatsAppConversation] = Relationship(back_populates="messages")


class EmailSendLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(index=True)
    sent_at: datetime = Field(default_factory=datetime.utcnow)
    template_key: str = Field(default="")
    template_subject: Optional[str] = None
    campaign_id: Optional[int] = None
    campaign_name: Optional[str] = None
    total_sent: int = Field(default=0)
    total_skipped: int = Field(default=0)
    total_errors: int = Field(default=0)
    error_details: Optional[str] = None
    initiated_by: Optional[str] = None
    source_email_only: bool = Field(default=False)
    source_email_list_id: Optional[int] = None
    source_batch_size: Optional[int] = None
    sent_details: Optional[str] = None  # JSON list of {name, email}


class EmailEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(index=True)
    prospect_email: str = Field(index=True)
    event_type: str = Field(index=True)   # delivered, open, click, bounce, unsubscribe, spamreport
    template_key: Optional[str] = None
    sg_message_id: Optional[str] = None
    sg_event_id: Optional[str] = Field(default=None, index=True)  # deduplication
    url: Optional[str] = None             # for click events
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class ScheduledEmailSend(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(index=True)
    campaign_id: Optional[int] = None
    template_key: str = Field(default="general")
    email_only: bool = Field(default=False)
    scheduled_at: datetime = Field(index=True)
    status: str = Field(default="pending")   # pending / running / done / cancelled / failed
    initiated_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    error: Optional[str] = None


class LeadHunt(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(foreign_key="organization.id", index=True)
    name: str
    phone: Optional[str] = None
    city: str
    category: str
    reviews_count: int = Field(default=0)
    has_website: bool = Field(default=False)
    website_url: Optional[str] = None
    rating: float = Field(default=0.0)
    pain_point: Optional[str] = None
    message_es: Optional[str] = None
    message_en: Optional[str] = None
    channel: Optional[str] = None           # whatsapp | email
    passed_checks: Optional[bool] = None
    check_reason: Optional[str] = None
    sent: bool = Field(default=False)
    sent_at: Optional[datetime] = None
    reply: Optional[str] = None
    reply_intent: Optional[str] = None      # positivo | negativo | pregunta
    is_hot: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Settings(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True)
    value: str = Field(default="")


class WebhookLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    organization_id: int = Field(index=True)
    event_type: str = Field(default="")
    success: bool = Field(default=False)
    status_code: Optional[int] = None
    response_text: Optional[str] = None
    duration_ms: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)
