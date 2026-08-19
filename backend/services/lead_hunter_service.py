import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

from anthropic import Anthropic, AsyncAnthropic
from outscraper import ApiClient
from sqlmodel import Session, select

from models import LeadHunt, Organization

logger = logging.getLogger(__name__)

CHAIN_BLACKLIST = [
    "MCDONALD", "SUBWAY", "WALMART", "BURGER KING", "WENDY", "TACO BELL",
    "DOMINO", "PIZZA HUT", "STARBUCKS", "CHIPOTLE", "POPEYES", "KFC",
    "DUNKIN", "SEVEN ELEVEN", "7-ELEVEN", "CIRCLE K", "CHEVRON", "SHELL",
    "EXXON", "BP"
]

FALLBACK_QUERIES = [
    "taquería", "panadería latina", "barbería hispana", "tienda latina",
    "envíos de dinero", "notaría latina", "carnicería hispana", "frutería",
]

MIN_RATING = 3.0
MAX_RATING = 4.6
MIN_REVIEWS = 5
MAX_REVIEWS = 80


def _fetch_query(
    client: ApiClient, query: str, city: str, fetch_limit: int,
    provider: str = "outscraper", google_api_key: str = "",
) -> list:
    """Run a single search query against the configured provider and return
    raw items shaped like Outscraper's google_maps_search results."""
    if provider == "google":
        from services.google_places_service import search_businesses, GooglePlacesError
        try:
            return search_businesses(
                f"{query} en {city}", api_key=google_api_key, limit=fetch_limit,
                min_rating=MIN_RATING, max_rating=MAX_RATING,
                min_reviews=MIN_REVIEWS, max_reviews=MAX_REVIEWS,
            )
        except GooglePlacesError:
            # A bad key / disabled API rejects every query identically — let
            # it propagate instead of silently returning zero leads with no
            # explanation, unlike a single query's transient failure below.
            raise
        except Exception as exc:
            logger.warning(f"[LeadHunter] query '{query}' in '{city}' failed: {exc}")
            return []

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


def _generate_queries_sync(org: Organization, api_key: str) -> list[str]:
    """Call Claude (sync) to generate Google Maps search queries from org config."""
    prompt = (
        "Eres un experto en generación de leads locales en USA para negocios hispanos.\n\n"
        f"La empresa busca este tipo de clientes: {org.lh_target_description}\n"
        f"Lo que ofrece: {org.lh_offer_description or 'servicios profesionales'}\n"
        f"Ciudades objetivo: {org.lh_cities or 'Miami FL'}\n\n"
        "Genera exactamente 8 queries de búsqueda para Google Maps que encuentren "
        "estos negocios. Las queries deben:\n"
        "- Estar en español\n"
        "- Ser términos específicos que use la comunidad latina (NO términos genéricos en inglés)\n"
        "- Evitar cadenas y franquicias\n"
        "- Cada query debe ser solo 2-3 palabras máximo\n\n"
        'Responde SOLO con un JSON array de strings, sin explicación, sin markdown:\n'
        '["query1", "query2", ...]'
    )
    try:
        client = Anthropic(api_key=api_key)
        resp = client.messages.create(
            model="claude-sonnet-5",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text).strip()
        result = json.loads(text)
        if isinstance(result, list):
            queries = [str(q).strip() for q in result if q][:10]
            if queries:
                logger.info(f"[LeadHunter] Claude generated {len(queries)} queries: {queries}")
                return queries
    except Exception as e:
        logger.warning(f"[LeadHunter] Failed to generate queries with Claude: {e}")
    return FALLBACK_QUERIES[:8]


def scout(limit: int = 17, org_id: int = None, session: Session = None) -> list:
    """
    Search Google Maps (via Outscraper, or Google Places as a fallback) using
    the org's Lead Hunter config. Requires lh_active=True and
    lh_target_description to be set. Uses Claude to generate search queries
    dynamically. Runs all (query, city) pairs in parallel via ThreadPoolExecutor.
    """
    # Load org config
    org = session.get(Organization, org_id) if (session and org_id) else None
    if not org:
        raise ValueError("Organización no encontrada")

    # Outscraper is the default when configured (org already paying for it);
    # otherwise fall back to Google Places using the org's own Google API key
    # (the same key slot used for Veo/Gemini) or the platform-wide env var —
    # Google gives ~$200/month of free usage before it starts billing.
    outscraper_key = os.getenv("OUTSCRAPER_API_KEY", "").strip()
    google_key = (org.google_api_key or "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()
    if outscraper_key:
        provider, api_key = "outscraper", outscraper_key
    elif google_key:
        provider, api_key = "google", google_key
    else:
        raise ValueError("Configura OUTSCRAPER_API_KEY o una Google API key (Configuración) para poder buscar negocios.")

    if not org.lh_active:
        raise ValueError("Lead Hunter no está activado para esta organización. Actívalo en Configuración → Lead Hunter.")
    if not (org.lh_target_description or "").strip():
        raise ValueError("Configura primero tu perfil de Lead Hunter: ¿A quién le vendes?")

    # Parse cities
    cities_raw = (org.lh_cities or "").strip()
    cities = [c.strip() for c in cities_raw.split(",") if c.strip()] if cities_raw else []
    if not cities:
        raise ValueError("Configura al menos una ciudad en tu perfil de Lead Hunter")
    cities = cities[:3]  # Cap to 3 cities to avoid too many API calls

    # Generate queries via Claude
    anthropic_key = (org.anthropic_api_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not anthropic_key:
        raise ValueError("Anthropic API key no configurada — necesaria para generar queries inteligentes")
    queries = _generate_queries_sync(org, anthropic_key)

    # Dedup against existing leads
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

    client = ApiClient(api_key=api_key) if provider == "outscraper" else None
    fetch_limit = max(limit * 2, 10)

    # Build (query, city) task list and run in parallel
    task_pairs = [(q, city) for city in cities for q in queries]
    raw_results: dict = {}
    with ThreadPoolExecutor(max_workers=min(len(task_pairs), 8)) as pool:
        futures = {
            pool.submit(_fetch_query, client, q, city, fetch_limit, provider, api_key): (q, city)
            for q, city in task_pairs
        }
        for future in as_completed(futures):
            key = futures[future]
            raw_results[key] = future.result()

    # Collect, filter, dedup
    collected: list[LeadHunt] = []
    for city in cities:
        for q in queries:
            if len(collected) >= limit:
                break
            for item in raw_results.get((q, city), []):
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
                    category=q,
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
        f"[LeadHunter] scout org={org_id} provider={provider} cities={cities} "
        f"queries={len(queries)} collected={len(leads)}"
    )
    return leads


def checker(leads: list, session=None) -> list:
    """Quality-check each lead in-place."""
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
    Use Claude Haiku to generate pain_point + personalized outreach messages.
    Uses org.lh_offer_description and org.lh_language to tailor the message.
    """
    api_key = (org.anthropic_api_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise ValueError("Anthropic API key no configurada para esta organización")

    offer = (org.lh_offer_description or "").strip() or "servicios profesionales"
    lang = (org.lh_language or "es").lower()
    website_info = (
        f"Sí ({lead.website_url})" if lead.has_website and lead.website_url
        else ("Sí" if lead.has_website else "No")
    )

    lang_map = {
        "es":   "SOLO en español",
        "en":   "ONLY in English",
        "both": "en español Y también en inglés",
    }
    lang_instruction = lang_map.get(lang, "en español")

    prompt = (
        f"Analiza este negocio real y genera un mensaje de prospección de ventas.\n\n"
        f"Negocio: {lead.name}\n"
        f"Categoría: {lead.category}\n"
        f"Ciudad: {lead.city}\n"
        f"Rating: {lead.rating:.1f} estrellas ({lead.reviews_count} reseñas en Google)\n"
        f"Tiene sitio web: {website_info}\n"
        f"Lo que ofrecemos: {offer}\n\n"
        f"Tareas:\n"
        f"1. Identifica el pain point principal de este tipo de negocio en UNA oración corta.\n"
        f"2. Escribe un mensaje de WhatsApp {lang_instruction} (máx. 3 oraciones, tono humano y directo, "
        f"menciona el nombre del negocio, algo específico de su situación y brevemente lo que ofrecemos).\n"
        + (
            f"3. Escribe el mismo mensaje en inglés (máx. 3 oraciones).\n\n"
            if lang == "both" else "\n"
        )
        + f"Responde ÚNICAMENTE con este JSON (sin texto extra, sin markdown):\n"
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
    """Send the outreach message via the specified channel."""
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
