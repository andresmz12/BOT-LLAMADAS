import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks, Query
from fastapi.responses import PlainTextResponse
from sqlmodel import Session, select
from database import get_session
from models import Organization, WhatsAppConversation, WhatsAppMessage

router = APIRouter(prefix="/webhook", tags=["whatsapp"])
logger = logging.getLogger(__name__)


@router.get("/whatsapp")
def verify_whatsapp_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    session: Session = Depends(get_session),
):
    if hub_mode == "subscribe" and hub_verify_token:
        org = session.exec(
            select(Organization).where(Organization.whatsapp_verify_token == hub_verify_token)
        ).first()
        if org:
            logger.info(f"[WhatsApp] Webhook verified for org={org.id}")
            return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403, detail="Token de verificación inválido")


@router.post("/whatsapp")
async def receive_whatsapp_message(
    request: Request,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
):
    body = await request.json()

    try:
        entry = body["entry"][0]
        change = entry["changes"][0]["value"]
        phone_number_id = change["metadata"]["phone_number_id"]
        messages_list = change.get("messages")
        if not messages_list:
            return {"status": "ignored"}
        message = messages_list[0]
        if message.get("type") != "text":
            return {"status": "ignored"}
        from_number = message["from"]
        message_text = message["text"]["body"]
        wa_message_id = message["id"]
    except (KeyError, IndexError, TypeError):
        return {"status": "ignored"}

    org = session.exec(
        select(Organization).where(
            Organization.whatsapp_phone_number_id == phone_number_id,
            Organization.whatsapp_enabled == True,  # noqa: E712
        )
    ).first()
    if not org:
        logger.warning(f"[WhatsApp] No org found for phone_number_id={phone_number_id}")
        return {"status": "org_not_found"}

    existing = session.exec(
        select(WhatsAppMessage).where(WhatsAppMessage.wa_message_id == wa_message_id)
    ).first()
    if existing:
        return {"status": "duplicate"}

    background_tasks.add_task(
        _process_wa_message, org.id, from_number, message_text, wa_message_id
    )
    return {"status": "ok"}


async def _process_wa_message(org_id: int, from_number: str, message_text: str, wa_message_id: str):
    from database import get_session as gs
    from services.whatsapp_service import generate_reply, send_text_message

    with next(gs()) as session:
        org = session.get(Organization, org_id)
        if not org:
            return

        # Obtener o crear conversación activa
        conv = session.exec(
            select(WhatsAppConversation).where(
                WhatsAppConversation.organization_id == org_id,
                WhatsAppConversation.wa_contact_id == from_number,
                WhatsAppConversation.status == "active",
            )
        ).first()
        if not conv:
            conv = WhatsAppConversation(
                organization_id=org_id,
                wa_contact_id=from_number,
            )
            session.add(conv)
            session.commit()
            session.refresh(conv)

        # Guardar mensaje del usuario
        user_msg = WhatsAppMessage(
            conversation_id=conv.id,
            organization_id=org_id,
            role="user",
            content=message_text,
            wa_message_id=wa_message_id,
        )
        session.add(user_msg)
        session.commit()

        # Historial para contexto (últimos 10 mensajes, excluyendo el que acaba de llegar)
        history_rows = session.exec(
            select(WhatsAppMessage)
            .where(
                WhatsAppMessage.conversation_id == conv.id,
                WhatsAppMessage.id != user_msg.id,
            )
            .order_by(WhatsAppMessage.created_at.desc())
            .limit(10)
        ).all()
        history = [{"role": m.role, "content": m.content} for m in reversed(history_rows)]

        # Generar respuesta con Claude
        try:
            reply = await generate_reply(org, history, message_text, session)
        except Exception as e:
            logger.error(f"[WhatsApp] Claude error org={org_id}: {e}")
            return

        # Guardar respuesta del asistente
        bot_msg = WhatsAppMessage(
            conversation_id=conv.id,
            organization_id=org_id,
            role="assistant",
            content=reply,
        )
        session.add(bot_msg)
        conv.updated_at = datetime.utcnow()
        session.add(conv)
        session.commit()

        # Enviar por WhatsApp
        try:
            await send_text_message(
                org.whatsapp_phone_number_id,
                org.whatsapp_access_token,
                from_number,
                reply,
            )
            logger.info(f"[WhatsApp] Replied to {from_number} org={org_id}")
        except Exception as e:
            logger.error(f"[WhatsApp] Send error org={org_id}: {e}")
