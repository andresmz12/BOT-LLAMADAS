import json
import logging
import os
import random
import re
from datetime import datetime

from anthropic import AsyncAnthropic
from outscraper import ApiClient
from sqlmodel import Session, select

from models import LeadHunt, Organization

logger = logging.getLogger(__name__)

LATINO_QUERIES = [
    "pupusería", "taquería", "frutería", "panadería latina",
    "carnicería hispana", "tienda latina", "restaurante mexicano",
    "restaurante salvadoreño", "restaurante colombiano", "restaurante cubano",
    "barbería latina", "salón de belleza hispano", "uñas latina",
    "lavandería hispana", "ferretería latina", "tortillería",
    "dulcería mexicana", "joyería latina", "envíos de dinero",
    "notaría latina"
]

CHAIN_BLACKLIST = [
    "MCDONALD", "SUBWAY", "WALMART", "BURGER KING", "WENDY", "TACO BELL",
    "DOMINO", "PIZZA HUT", "STARBUCKS", "CHIPOTLE", "POPEYES", "KFC",
    "DUNKIN", "SEVEN ELEVEN", "7-ELEVEN", "CIRCLE K", "CHEVRON", "SHELL",
    "EXXON", "BP"
]


def scout(city: str, limit: int = 17, org_id: int = None, session: Session = None) -> list:
    """
    Search Google Maps via Outscraper for small Latino businesses in city.
    Filters: rating 3.0–4.6, reviews 5–80, has phone, not a chain.
    Deduplicates against existing LeadHunt records for the org.
    """
    client = ApiClient(api_key=os.getenv("OUTSCRAPER_API_KEY"))
    queries = random.sample(LATINO_QUERIES, min(len(LATINO_QUERIES), limit))

    existing_phones: set[str] = set()
    if session and org_id:
        rows = session.exec(
            select(LeadHunt.phone).where(LeadHunt.org_id == org_id)
        ).all()
        existing_phones = {p for p in rows if p}

    collected: list[LeadHunt] = []

    for query in queries:
        if len(collected) >= limit:
            break
        try:
            results = client.google_maps_search(
                f"{query} en {city}",
                limit=limit * 2,
                language="es",
                region="us",
            )
            items = results[0] if results and isinstance(results[0], list) else results
            for item in items:
                if len(collected) >= limit:
                    break
                rating = item.get("rating") or 0
                reviews = item.get("reviews_count") or item.get("reviews") or 0
                phone = (item.get("phone") or "").strip()
                name = (item.get("name") or "").upper()

                if not (3.0 <= rating <= 4.6):
                    continue
                if not (5 <= reviews <= 80):
                    continue
                if not phone:
                    continue
                if any(chain in name for chain in CHAIN_BLACKLIST):
                    continue
                if item.get("is_chain") or item.get("chain"):
                    continue
                if phone in existing_phones:
                    continue

                existing_phones.add(phone)
                website = (item.get("site") or item.get("website") or "").strip()
                collected.append(LeadHunt(
                    name=item.get("name") or "",
                    phone=phone,
                    city=city,
                    category=query,
                    reviews_count=reviews,
                    rating=rating,
                    has_website=bool(website),
                    website_url=website or None,
                    org_id=org_id,
                ))
        except Exception:
            continue

    logger.info(
        f"[LeadHunter] scout org={org_id} city={city!r} collected={len(collected)}"
    )
    return collected[:limit]


def checker(leads: list, session=None) -> list:
    """
    Quality-check each lead in-place.
    Passes when: has phone AND 3.5 ≤ rating ≤ 4.5 AND reviews_count < 80.
    Sets passed_checks (bool) and check_reason (str | None).
    """
    for lead in leads:
        if not lead.phone:
            lead.passed_checks = False
            lead.check_reason = "Sin número de teléfono"
        elif not (3.5 <= lead.rating <= 4.5):
            lead.passed_checks = False
            lead.check_reason = f"Rating fuera del rango óptimo ({lead.rating:.1f})"
        elif lead.reviews_count >= 80:
            lead.passed_checks = False
            lead.check_reason = f"Demasiadas reseñas ({lead.reviews_count}) — negocio ya establecido"
        else:
            lead.passed_checks = True
            lead.check_reason = None

        if session:
            session.add(lead)

    if session and leads:
        session.commit()
    return leads


async def craft_messages(lead: LeadHunt, org: Organization, session=None) -> LeadHunt:
    """
    Use Claude Haiku to generate:
    - pain_point: one-sentence problem this type of business typically faces
    - message_es: WhatsApp outreach in Spanish (max 3 sentences)
    - message_en: same in English
    """
    api_key = (org.anthropic_api_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise ValueError("Anthropic API key no configurada para esta organización")

    website_info = f"Sí ({lead.website_url})" if lead.has_website and lead.website_url else ("Sí" if lead.has_website else "No")

    prompt = (
        f"Analiza este negocio real y genera un mensaje de prospección de ventas.\n\n"
        f"Negocio: {lead.name}\n"
        f"Categoría: {lead.category}\n"
        f"Ciudad: {lead.city}\n"
        f"Rating: {lead.rating:.1f} estrellas ({lead.reviews_count} reseñas en Google)\n"
        f"Tiene sitio web: {website_info}\n\n"
        f"Tareas:\n"
        f"1. Identifica el pain point principal de este tipo de negocio en UNA oración corta.\n"
        f"2. Escribe un mensaje de WhatsApp en español (máx. 3 oraciones, tono humano y directo, "
        f"menciona el nombre del negocio y algo específico de su situación).\n"
        f"3. Escribe el mismo mensaje en inglés (máx. 3 oraciones).\n\n"
        f"Responde ÚNICAMENTE con este JSON (sin texto extra, sin markdown):\n"
        f'{{"pain_point": "...", "message_es": "...", "message_en": "..."}}'
    )

    client = AsyncAnthropic(api_key=api_key)
    resp = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()

    try:
        data = json.loads(text)
    except Exception:
        data = {"pain_point": "", "message_es": text[:500], "message_en": ""}

    lead.pain_point = (data.get("pain_point") or "").strip()
    lead.message_es = (data.get("message_es") or "").strip()
    lead.message_en = (data.get("message_en") or "").strip()

    if session:
        session.add(lead)
        session.commit()
        session.refresh(lead)

    logger.info(f"[LeadHunter] craft org={org.id} lead={lead.id} name={lead.name!r}")
    return lead


async def dispatch(lead: LeadHunt, org: Organization, channel: str, session=None) -> LeadHunt:
    """
    Send the outreach message via the specified channel.
    channel: "whatsapp" only (email requires an email address not stored in this model).
    Updates lead.sent, lead.sent_at, lead.channel.
    """
    message = (lead.message_es or lead.message_en or "").strip()
    if not message:
        raise ValueError("No hay mensaje generado. Ejecuta 'Generar mensaje' antes de enviar.")

    if channel == "whatsapp":
        if not org.whatsapp_enabled:
            raise ValueError("WhatsApp no está habilitado para esta organización (actívalo en Configuración)")
        if not org.whatsapp_phone_number_id or not org.whatsapp_access_token:
            raise ValueError("WhatsApp no está configurado (falta Phone Number ID o Access Token)")
        if not lead.phone:
            raise ValueError("Este lead no tiene número de teléfono")
        from services.whatsapp_service import send_text_message
        await send_text_message(
            phone_number_id=org.whatsapp_phone_number_id,
            access_token=org.whatsapp_access_token,
            to=lead.phone,
            text=message,
        )
    else:
        raise ValueError(f"Canal '{channel}' no soportado. Usa 'whatsapp'.")

    lead.sent = True
    lead.sent_at = datetime.utcnow()
    lead.channel = channel

    if session:
        session.add(lead)
        session.commit()
        session.refresh(lead)

    logger.info(f"[LeadHunter] dispatch org={org.id} lead={lead.id} channel={channel}")
    return lead
