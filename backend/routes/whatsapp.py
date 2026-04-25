import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from sqlalchemy import desc
from database import get_session
from models import User, Organization, WhatsAppConversation, WhatsAppMessage
from routes.auth import get_current_user

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
logger = logging.getLogger(__name__)


@router.get("/conversations")
def list_conversations(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if not current_user.organization_id:
        return []
    convs = session.exec(
        select(WhatsAppConversation)
        .where(WhatsAppConversation.organization_id == current_user.organization_id)
        .order_by(desc(WhatsAppConversation.updated_at))
        .limit(100)
    ).all()
    result = []
    for conv in convs:
        last_msg = session.exec(
            select(WhatsAppMessage)
            .where(WhatsAppMessage.conversation_id == conv.id)
            .order_by(desc(WhatsAppMessage.created_at))
            .limit(1)
        ).first()
        result.append({
            "id": conv.id,
            "wa_contact_id": conv.wa_contact_id,
            "contact_name": conv.contact_name,
            "status": conv.status,
            "updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "last_message": last_msg.content[:80] if last_msg else None,
            "last_role": last_msg.role if last_msg else None,
        })
    return result


@router.get("/conversations/{conv_id}/messages")
def list_messages(
    conv_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    conv = session.get(WhatsAppConversation, conv_id)
    if not conv:
        raise HTTPException(404, "Conversación no encontrada")
    if conv.organization_id != current_user.organization_id and current_user.role != "superadmin":
        raise HTTPException(403, "Acceso denegado")
    msgs = session.exec(
        select(WhatsAppMessage)
        .where(WhatsAppMessage.conversation_id == conv_id)
        .order_by(WhatsAppMessage.created_at)
    ).all()
    return [{"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at.isoformat()} for m in msgs]
