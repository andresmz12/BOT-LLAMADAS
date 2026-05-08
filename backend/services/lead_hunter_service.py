import asyncio
import json
import logging
import os
import re
from datetime import datetime

import httpx
from anthropic import AsyncAnthropic

from models import LeadHunt, Organization

logger = logging.getLogger(__name__)

APIFY_ACTOR = "compass~crawler-google-places"
APIFY_BASE = "https://api.apify.com/v2"


async def scout(
    org_id: int,
    city: str,
    category: str,
    limit: int = 17,
    apify_token: str = "",
    session=None,
) -> list:
    """
    Search Google Maps for businesses matching category in city.
    Filters: rating 3.5–4.5, reviewsCount < 80.
    Prioritizes: has_phone first, then by reviewsCount desc.
    Saves results as LeadHunt records and returns them.
    """
    token = apify_token.strip() or os.getenv("APIFY_API_TOKEN", "").strip()
    if not token:
        raise ValueError("APIFY_API_TOKEN no configurado para esta organización")

    actor_input = {
        "searchStringsArray": [f"{category} in {city}"],
        "maxCrawledPlacesPerSearch": min(limit * 3, 150),
        "includeHistogram": False,
        "includeOpeningHours": False,
        "includePeopleAlsoSearchFor": False,
        "language": "en",
        "skipClosedPlaces": True,
    }

    async with httpx.AsyncClient(timeout=300) as client:
        run_resp = await client.post(
            f"{APIFY_BASE}/acts/{APIFY_ACTOR}/runs",
            headers={"Authorization": f"Bearer {token}"},
            json=actor_input,
        )
        if run_resp.status_code >= 400:
            raise RuntimeError(f"Error Apify {run_resp.status_code}: {run_resp.text[:300]}")

        run_id = run_resp.json().get("data", {}).get("id", "")
        if not run_id:
            raise RuntimeError("Apify no devolvió run_id")

        run_status = ""
        for _ in range(70):
            await asyncio.sleep(3)
            sr = await client.get(
                f"{APIFY_BASE}/actor-runs/{run_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            run_status = sr.json().get("data", {}).get("status", "")
            if run_status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                break

        if run_status != "SUCCEEDED":
            raise RuntimeError(f"Apify run terminó con estado: {run_status}")

        items_resp = await client.get(
            f"{APIFY_BASE}/actor-runs/{run_id}/dataset/items",
            headers={"Authorization": f"Bearer {token}"},
            params={"format": "json", "limit": limit * 3},
        )
        items = items_resp.json() if items_resp.status_code == 200 else []

    # Filter: rating 3.5–4.5, reviews < 80
    filtered = []
    for item in items:
        rating = float(item.get("totalScore") or item.get("rating") or 0)
        reviews = int(item.get("reviewsCount") or item.get("numRatings") or 0)
        if not (3.5 <= rating <= 4.5):
            continue
        if reviews >= 80:
            continue
        filtered.append(item)

    # Prioritize: phone-equipped leads first, then sort by reviews desc
    def _has_phone(i):
        return bool((i.get("phone") or i.get("phoneUnformatted") or "").strip())

    def _reviews(i):
        return int(i.get("reviewsCount") or i.get("numRatings") or 0)

    has_phone = sorted([i for i in filtered if _has_phone(i)], key=_reviews, reverse=True)
    no_phone  = sorted([i for i in filtered if not _has_phone(i)], key=_reviews, reverse=True)
    prioritized = (has_phone + no_phone)[:limit]

    saved = []
    for item in prioritized:
        name = (item.get("title") or item.get("name") or "").strip()
        if not name:
            continue
        phone = (item.get("phone") or item.get("phoneUnformatted") or "").strip()
        website = (item.get("website") or item.get("url") or "").strip()
        rating = float(item.get("totalScore") or item.get("rating") or 0)
        reviews = int(item.get("reviewsCount") or item.get("numRatings") or 0)

        lead = LeadHunt(
            org_id=org_id,
            name=name,
            phone=phone or None,
            city=city,
            category=category,
            reviews_count=reviews,
            has_website=bool(website),
            website_url=website or None,
            rating=rating,
        )
        if session:
            session.add(lead)
        saved.append(lead)

    if session and saved:
        session.commit()
        for lead in saved:
            session.refresh(lead)

    logger.info(
        f"[LeadHunter] scout org={org_id} city={city!r} category={category!r} "
        f"raw={len(items)} filtered={len(filtered)} saved={len(saved)}"
    )
    return saved


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
