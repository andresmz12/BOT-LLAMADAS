import json
import logging
import os
import random
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
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

MIN_RATING = 3.0
MAX_RATING = 4.6
MIN_REVIEWS = 5
MAX_REVIEWS = 80


def _fetch_query(client: ApiClient, query: str, city: str, fetch_limit: int) -> list:
    """Run a single Outscraper query and return raw items list."""
    try:
        results = client.google_maps_search(
            f"{query} en {city}",
            limit=fetch_limit,
            language="es",
            region="us",
        )
        items = results[0] if results and isinstance(results[0], list) else results
        return items or []
    except Exception as exc:
        logger.warning(f"[LeadHunter] query '{query}' in '{city}' failed: {exc}")
        return []


def scout(city: str, limit: int = 17, org_id: int = None, session: Session = None) -> list:
    """
    Search Google Maps via Outscraper for small Latino businesses in city.
    Filters: rating 3.0–4.6, reviews 5–80, has phone, not a chain.
    Runs up to `limit` queries in parallel (ThreadPoolExecutor).
    Deduplicates against existing LeadHunt records for the org.
    Saves results to DB when session is provided.
    """
    api_key = os.getenv("OUTSCRAPER_API_KEY", "").strip()
    if not api_key:
        raise ValueError("OUTSCRAPER_API_KEY no configurada")

    client = ApiClient(api_key=api_key)
    queries = random.sample(LATINO_QUERIES, min(len(LATINO_QUERIES), limit))
    fetch_limit = max(limit * 2, 10)

    existing_phones: set[str] = set()
    existing_names: set[str] = set()
    if session and org_id:
        rows = session.exec(
            select(LeadHunt.phone, LeadHunt.name).where(LeadHunt.org_id == org_id)
        ).all()
        for phone, name in rows:
            if phone:
                existing_phones.add(phone)
            if name:
                existing_names.add(name.lower().strip())

    # Run all queries in parallel — Outscraper calls are blocking HTTP
    raw_results: dict[str, list] = {}
    with ThreadPoolExecutor(max_workers=min(len(queries), 5)) as pool:
        futures = {
            pool.submit(_fetch_query, client, q, city, fetch_limit): q
            for q in queries
        }
        for future in as_completed(futures):
            query = futures[future]
            raw_results[query] = future.result()

    collected: list[LeadHunt] = []

    for query in queries:
        if len(collected) >= limit:
            break
        for item in raw_results.get(query, []):
            if len(collected) >= limit:
                break

            rating = float(item.get("rating") or 0)
            reviews = int(item.get("reviews_count") or item.get("reviews") or 0)
            phone = (item.get("phone") or "").strip()
            name = (item.get("name") or "").strip()
            name_upper = name.upper()

            if not (MIN_RATING <= rating <= MAX_RATING):
                continue
            if not (MIN_REVIEWS <= reviews <= MAX_REVIEWS):
                continue
            if not phone:
                continue
            if any(chain in name_upper for chain in CHAIN_BLACKLIST):
                continue
            if item.get("is_chain") or item.get("chain"):
                continue
            if phone in existing_phones:
                continue
            if name.lower().strip() in existing_names:
                continue

            existing_phones.add(phone)
            existing_names.add(name.lower().strip())
            website = (item.get("site") or item.get("website") or "").strip()
            collected.append(LeadHunt(
                name=name,
                phone=phone,
                city=city,
                category=query,
                reviews_count=reviews,
                rating=rating,
                has_website=bool(website),
                website_url=website or None,
                org_id=org_id,
            ))

    leads = collected[:limit]

    if session and leads:
        for lead in leads:
            session.add(lead)
        session.commit()
        for lead in leads:
            session.refresh(lead)

    logger.info(
        f"[LeadHunter] scout org={org_id} city={city!r} "
        f"queries={len(queries)} collected={len(leads)}"
    )
    return leads


def checker(leads: list, session=None) -> list:
    """
    Quality-check each lead in-place.
    Passes when: has phone AND MIN_RATING ≤ rating ≤ MAX_RATING AND MIN_REVIEWS ≤ reviews ≤ MAX_REVIEWS.
    Sets passed_checks (bool) and check_reason (str | None).
    """
    for lead in leads:
        if not lead.phone:
            lead.passed_checks = False
            lead.check_reason = "Sin número de teléfono"
        elif not (MIN_RATING <= lead.rating <= MAX_RATING):
            lead.passed_checks = False
            lead.check_reason = f"Rating fuera del rango óptimo ({lead.rating:.1f})"
        elif not (MIN_REVIEWS <= lead.reviews_count <= MAX_REVIEWS):
            lead.passed_checks = False
            lead.check_reason = f"Reseñas fuera del rango ({lead.reviews_count})"
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
