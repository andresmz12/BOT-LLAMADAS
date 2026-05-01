import csv
import io
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from pydantic import BaseModel, field_validator
from typing import Optional
from database import get_session
from models import Prospect, Campaign, AgentConfig, Call, User, Organization
from routes.auth import get_current_user, require_write_access, require_pro_plan

router = APIRouter(prefix="/prospects", tags=["prospects"])


def normalize_phone(phone: str, country_code: str = "+1") -> str:
    phone = phone.strip()
    if not phone:
        return phone
    if phone.startswith('+'):
        digits = re.sub(r'\D', '', phone[1:])
        return '+' + digits if digits else phone
    digits = re.sub(r'\D', '', phone)
    if not digits:
        return phone
    cc_digits = re.sub(r'\D', '', country_code)
    if digits.startswith(cc_digits) and len(digits) > len(cc_digits):
        return '+' + digits
    return country_code + digits


def _validate_phone(v: str) -> str:
    v = v.strip()
    if not re.match(r"^\+?[\d\s\-().]{7,20}$", v):
        raise ValueError("Número de teléfono inválido")
    return v


class ProspectCreate(BaseModel):
    campaign_id: int
    name: str
    phone: str
    company: Optional[str] = None
    notes: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: str) -> str:
        return _validate_phone(v)

    @field_validator("name")
    @classmethod
    def name_length(cls, v: str) -> str:
        if len(v) > 200:
            raise ValueError("Nombre demasiado largo")
        return v.strip()


class ProspectUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return _validate_phone(v)

    @field_validator("status")
    @classmethod
    def status_valid(cls, v: Optional[str]) -> Optional[str]:
        allowed = {"pending", "calling", "answered", "no_answer", "voicemail", "failed"}
        if v is not None and v not in allowed:
            raise ValueError(f"Estado inválido: {v}")
        return v


@router.post("")
def create_prospect(
    data: ProspectCreate,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    prospect = Prospect(
        campaign_id=data.campaign_id,
        name=data.name,
        phone=normalize_phone(data.phone),
        company=data.company or None,
        notes=data.notes or None,
        organization_id=current_user.organization_id,
    )
    session.add(prospect)
    session.commit()
    session.refresh(prospect)
    return prospect


@router.post("/import")
async def import_file(
    campaign_id: int = Form(...),
    file: UploadFile = File(...),
    phone_country_code: str = Form(default="+1"),
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo no puede superar 10 MB")
    filename = (file.filename or "").lower()
    if not (filename.endswith(".xlsx") or filename.endswith(".xls") or filename.endswith(".csv")):
        raise HTTPException(status_code=400, detail="Solo se permiten archivos CSV, XLS o XLSX")
    rows = []

    if filename.endswith(".xlsx") or filename.endswith(".xls"):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        ws = wb.active
        headers = None
        for excel_row in ws.iter_rows(values_only=True):
            if headers is None:
                headers = [str(c).strip().lower() if c else "" for c in excel_row]
            else:
                rows.append(dict(zip(headers, [str(c).strip() if c is not None else "" for c in excel_row])))
    else:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        rows = [{k.strip().lower(): v for k, v in r.items()} for r in reader]

    imported = 0
    for row in rows:
        # Phone: "phone" or "phone number"
        phone = (row.get("phone") or row.get("phone number") or "").strip()
        has_contact = "contact" in row
        name = (row.get("contact") or row.get("name") or "").strip()
        company = (row.get("company") or (row.get("name") if has_contact else "") or "").strip()
        email = (row.get("email") or "").strip()
        import re
        if not phone or not re.match(r"^\+?[\d\s\-().]{7,20}$", phone):
            continue
        phone = normalize_phone(phone, phone_country_code)
        session.add(Prospect(
            campaign_id=campaign_id,
            name=name,
            phone=phone,
            email=email or None,
            company=company or None,
            organization_id=current_user.organization_id,
        ))
        imported += 1
    session.commit()
    return {"imported": imported}


@router.get("")
def list_prospects(
    campaign_id: int | None = None,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if campaign_id:
        query = query.where(Prospect.campaign_id == campaign_id)
    if status:
        query = query.where(Prospect.status == status)
    return session.exec(query).all()


@router.put("/{prospect_id}")
def update_prospect(
    prospect_id: int,
    data: ProspectUpdate,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if current_user.role != "superadmin" and prospect.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(prospect, field, value)
    session.add(prospect)
    session.commit()
    session.refresh(prospect)
    return prospect


@router.post("/{prospect_id}/call")
async def call_prospect(
    prospect_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    from services import retell_client

    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    campaign = session.get(Campaign, prospect.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")

    agent = session.get(AgentConfig, campaign.agent_config_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    api_key = (org.retell_api_key if org else "") or ""
    from_number = (org.retell_phone_number if org else "") or ""

    call = Call(
        prospect_id=prospect.id,
        campaign_id=campaign.id,
        status="initiated",
        organization_id=current_user.organization_id,
    )
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        result = await retell_client.create_call(
            prospect.phone, agent,
            prospect_name=prospect.name,
            prospect_company=prospect.company or "",
            api_key=api_key,
            from_number=from_number,
        )
        call.retell_call_id = result.get("call_id", "")
        call.status = "in-progress"
        prospect.status = "calling"
        prospect.call_attempts += 1
        prospect.last_called_at = datetime.utcnow()
        session.add(call)
        session.add(prospect)
        session.commit()
        return {"call_id": call.id, "retell_call_id": call.retell_call_id, "status": "in-progress"}
    except Exception as e:
        call.status = "failed"
        session.add(call)
        session.commit()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/retry")
def retry_prospects(
    campaign_id: int | None = None,
    status: str | None = None,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Reset prospects to 'pending' so they get dialed again on the next campaign run."""
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if campaign_id:
        query = query.where(Prospect.campaign_id == campaign_id)
    if status:
        query = query.where(Prospect.status == status)
    else:
        # Default: retry failed and voicemail
        query = query.where(Prospect.status.in_(["failed", "voicemail"]))
    prospects = session.exec(query).all()
    for p in prospects:
        p.status = "pending"
        p.call_attempts = 0
        session.add(p)
    session.commit()
    return {"reset": len(prospects)}


@router.delete("")
def delete_all_prospects(
    campaign_id: int | None = None,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if campaign_id:
        query = query.where(Prospect.campaign_id == campaign_id)
    prospects = session.exec(query).all()
    for p in prospects:
        session.delete(p)
    session.commit()
    return {"deleted": len(prospects)}


@router.delete("/{prospect_id}")
def delete_prospect(
    prospect_id: int,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    if current_user.role != "superadmin" and prospect.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    session.delete(prospect)
    session.commit()
    return {"ok": True}


# ── Apify / Google Maps search ────────────────────────────────────────────────

class ApifySearchRequest(BaseModel):
    campaign_id: int
    search_term: str
    location: str
    zone: str = ""
    max_results: int = 50
    exclude_keywords: str = ""
    exclude_chains: bool = True
    dedupe_by_brand: bool = True
    min_reviews: int = 0
    max_reviews: int = 0  # 0 = no cap
    min_rating: float = 0.0
    skip_closed: bool = True
    require_phone: bool = True
    language: str = "en"
    # Geographic radius (overrides location string when set)
    radius_zip: str = ""
    radius_miles: int = 0
    # Freshness — only keep places with a review newer than N days (0 = off)
    fresh_days: int = 0
    # Website filter: "any" | "with" | "without"
    website_filter: str = "any"
    # Skip prospects whose phone already exists in the org
    skip_existing_in_org: bool = True


def _brand_key(name: str) -> str:
    n = name.lower()
    n = re.sub(r'\b(inc|llc|corp|ltd|co|no|num|sucursal|branch|location|store)\b', '', n)
    n = re.sub(r'#\s*\d+', '', n)
    n = re.sub(r'\b\d+\b', '', n)
    n = re.sub(r'[^\w\s]', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


_CHAIN_KEYWORDS = [
    "walmart", "mcdonald", "starbucks", "burger king", "wendy's", "taco bell",
    "domino", "pizza hut", "subway", "dunkin", "7-eleven", "cvs", "walgreens",
    "dollar general", "dollar tree", "family dollar", "target", "costco",
    "home depot", "lowe's", "autozone", "advance auto", "o'reilly",
    "chase bank", "wells fargo", "bank of america", "citibank", "td bank",
    "h&r block", "jackson hewitt", "liberty tax",
    "shell", "exxon", "chevron", "bp ", "circle k", "speedway",
    # Major shipping/parcel carriers — never independents, exclude by default
    "ups store", "the ups store", "fedex", "fed ex", "fed-ex", "dhl",
    "usps", "united states postal", "post office", "u.s. post",
    "amazon hub", "amazon locker", "ontrac", "lasershop", "lasership",
    "purolator", "aramex", "tnt express",
]


@router.post("/search-apify")
async def search_apify_prospects(
    data: ApifySearchRequest,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    import asyncio
    import httpx

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    if not org or not org.apify_enabled:
        raise HTTPException(status_code=403, detail="Búsqueda con IA no habilitada para esta organización")

    api_token = (org.apify_api_token or "").strip() or __import__("os").getenv("APIFY_API_TOKEN", "")
    if not api_token:
        raise HTTPException(status_code=503, detail="Token de Apify no configurado para esta organización")

    campaign = session.get(Campaign, data.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")

    user_excludes = [kw.strip().lower() for kw in data.exclude_keywords.split(",") if kw.strip()]
    chain_excludes = _CHAIN_KEYWORDS if data.exclude_chains else []
    all_excludes = user_excludes + chain_excludes

    # Allow multi-keyword and multi-location input (comma separated). Build the
    # cartesian product as the searchStringsArray so a single Apify run covers
    # every combination, e.g. ["paqueteria Illinois", "envios Illinois", ...].
    keywords = [k.strip() for k in data.search_term.split(",") if k.strip()]

    # Geographic radius mode replaces the location string with a single
    # "<keyword> within X miles of <zip>" search string. Single zip + radius is
    # far more precise than broad city/state and matches sales-territory needs.
    if data.radius_zip.strip() and data.radius_miles > 0:
        zip_code = data.radius_zip.strip()
        radius = max(1, min(data.radius_miles, 100))
        search_strings = [f"{kw} within {radius} miles of {zip_code}" for kw in keywords]
    else:
        locations = [l.strip() for l in data.location.split(",") if l.strip()]
        if not keywords or not locations:
            raise HTTPException(status_code=400, detail="Debes ingresar al menos una palabra clave y una ubicación")
        zone_prefix = f"{data.zone.strip()}, " if data.zone.strip() else ""
        search_strings = [f"{kw} in {zone_prefix}{loc}" for kw in keywords for loc in locations]

    actor_input = {
        "searchStringsArray": search_strings,
        "maxCrawledPlacesPerSearch": min(data.max_results * 3, 500),
        "includeHistogram": False,
        "includeOpeningHours": False,
        "includePeopleAlsoSearchFor": False,
        "language": data.language,
        "skipClosedPlaces": data.skip_closed,
    }

    # timeout=300 covers the full polling loop (70 * 3 = 210 s) with margin
    async with httpx.AsyncClient(timeout=300) as client:
        run_resp = await client.post(
            "https://api.apify.com/v2/acts/compass~crawler-google-places/runs",
            headers={"Authorization": f"Bearer {api_token}"},
            json=actor_input,
        )
        if run_resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f"Error Apify: {run_resp.text[:300]}")

        run_id = run_resp.json().get("data", {}).get("id", "")
        if not run_id:
            raise HTTPException(status_code=502, detail="Apify no devolvió run_id")

        run_status = ""
        for _ in range(70):
            await asyncio.sleep(3)
            status_resp = await client.get(
                f"https://api.apify.com/v2/actor-runs/{run_id}",
                headers={"Authorization": f"Bearer {api_token}"},
            )
            run_status = status_resp.json().get("data", {}).get("status", "")
            if run_status in ("SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"):
                break

        if run_status != "SUCCEEDED":
            # Fetch run log to surface the actual error reason
            error_detail = f"Apify run terminó con estado: {run_status}"
            try:
                log_resp = await client.get(
                    f"https://api.apify.com/v2/actor-runs/{run_id}/log",
                    headers={"Authorization": f"Bearer {api_token}"},
                    params={"limit": 2000},
                )
                if log_resp.status_code == 200:
                    error_lines = [
                        ln for ln in log_resp.text.splitlines()
                        if "ERROR" in ln or "error" in ln.lower()
                    ]
                    if error_lines:
                        error_detail += f" — {error_lines[0][:200]}"
            except Exception:
                pass
            raise HTTPException(status_code=502, detail=error_detail)

        items_resp = await client.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
            headers={"Authorization": f"Bearer {api_token}"},
            params={"format": "json", "limit": min(data.max_results * 3, 500)},
        )
        items = items_resp.json() if items_resp.status_code == 200 else []

    skipped_duplicates = 0
    if data.dedupe_by_brand:
        brand_best: dict[str, dict] = {}
        for item in items:
            key = _brand_key((item.get("title") or item.get("name") or ""))
            if not key:
                continue
            reviews = item.get("reviewsCount") or item.get("numRatings") or 0
            existing = brand_best.get(key)
            if existing is None:
                brand_best[key] = item
            elif reviews > (existing.get("reviewsCount") or existing.get("numRatings") or 0):
                skipped_duplicates += 1
                brand_best[key] = item
            else:
                skipped_duplicates += 1
        items = list(brand_best.values())

    # Pre-load existing phones in the org for anti-duplicate skip. Doing this
    # once up-front avoids N+1 queries inside the loop.
    existing_phones: set[str] = set()
    if data.skip_existing_in_org and current_user.organization_id:
        rows = session.exec(
            select(Prospect.phone).where(Prospect.organization_id == current_user.organization_id)
        ).all()
        existing_phones = {p for p in rows if p}

    from datetime import timedelta
    fresh_cutoff = datetime.utcnow() - timedelta(days=data.fresh_days) if data.fresh_days > 0 else None
    six_months_ago = datetime.utcnow() - timedelta(days=180)

    imported = 0
    skipped_no_phone = 0
    skipped_no_reviews = 0
    skipped_too_many_reviews = 0
    skipped_low_rating = 0
    skipped_excluded = 0
    skipped_stale = 0
    skipped_website = 0
    skipped_existing = 0

    for item in items:
        if imported >= data.max_results:
            break

        reviews = item.get("reviewsCount") or item.get("numRatings") or 0
        if data.min_reviews > 0 and reviews < data.min_reviews:
            skipped_no_reviews += 1
            continue
        if data.max_reviews > 0 and reviews > data.max_reviews:
            skipped_too_many_reviews += 1
            continue

        if data.min_rating > 0:
            rating_val = item.get("totalScore") or item.get("rating") or 0
            if rating_val < data.min_rating:
                skipped_low_rating += 1
                continue

        phone_raw = (item.get("phone") or item.get("phoneUnformatted") or "").strip()
        if data.require_phone and not phone_raw:
            skipped_no_phone += 1
            continue

        name = (item.get("title") or item.get("name") or "").strip()
        if any(kw in name.lower() for kw in all_excludes):
            skipped_excluded += 1
            continue

        website = (item.get("website") or item.get("url") or "").strip()
        if data.website_filter == "with" and not website:
            skipped_website += 1
            continue
        if data.website_filter == "without" and website:
            skipped_website += 1
            continue

        # Freshness — most recent review date if Apify returned reviews
        last_review_at = None
        reviews_list = item.get("reviews") or []
        if isinstance(reviews_list, list) and reviews_list:
            for r in reviews_list:
                ts = r.get("publishedAtDate") or r.get("publishAt") or r.get("publishedAt")
                if not ts:
                    continue
                try:
                    parsed = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    continue
                if last_review_at is None or parsed > last_review_at:
                    last_review_at = parsed
        # Fall back to actor's lastUpdatedAt for the place itself
        if last_review_at is None:
            ts = item.get("lastUpdatedAt") or item.get("scrapedAt")
            if ts:
                try:
                    last_review_at = datetime.fromisoformat(str(ts).replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    last_review_at = None
        if fresh_cutoff and (last_review_at is None or last_review_at < fresh_cutoff):
            skipped_stale += 1
            continue

        phone = normalize_phone(phone_raw, "+1") if phone_raw else ""

        # Anti-duplicates within the organization (across all campaigns)
        if phone and phone in existing_phones:
            skipped_existing += 1
            continue

        # Email enrichment — Apify returns emails when it could scrape them
        email = ""
        emails_field = item.get("emails")
        if isinstance(emails_field, list) and emails_field:
            email = str(emails_field[0]).strip()
        elif isinstance(emails_field, str):
            email = emails_field.strip()
        if not email:
            email = (item.get("email") or "").strip()

        rating = item.get("totalScore") or item.get("rating") or 0
        place_id = (item.get("placeId") or item.get("place_id") or "").strip() or None
        address = (item.get("address") or item.get("street") or "").strip()

        # Quality score 0-100 — universal across industries
        score = 0
        if phone:
            score += 20
        if website:
            score += 20
        if email:
            score += 20
        if reviews >= 10:
            score += 15
        elif reviews >= 3:
            score += 7
        if rating and rating >= 4:
            score += 15
        elif rating and rating >= 3.5:
            score += 8
        if last_review_at and last_review_at > six_months_ago:
            score += 10

        notes_parts = []
        if address:
            notes_parts.append(address)
        if rating:
            notes_parts.append(f"Rating: {rating} ({reviews} reseñas)")
        if website:
            notes_parts.append(website)

        session.add(Prospect(
            campaign_id=data.campaign_id,
            name=name,
            phone=phone,
            email=email or None,
            company=name,
            notes=" | ".join(notes_parts) or None,
            organization_id=current_user.organization_id,
            website=website or None,
            place_id=place_id,
            last_review_at=last_review_at,
            quality_score=score,
        ))
        if phone:
            existing_phones.add(phone)  # prevent same-batch duplicates too
        imported += 1

    session.commit()
    return {
        "imported": imported,
        "total_found": len(items),
        "skipped_no_phone": skipped_no_phone,
        "skipped_no_reviews": skipped_no_reviews,
        "skipped_too_many_reviews": skipped_too_many_reviews,
        "skipped_low_rating": skipped_low_rating,
        "skipped_duplicates": skipped_duplicates,
        "skipped_existing": skipped_existing,
        "skipped_stale": skipped_stale,
        "skipped_website": skipped_website,
        "skipped_excluded": skipped_excluded,
    }


class ExpandKeywordsRequest(BaseModel):
    seed: str
    language: str = "en"


@router.post("/expand-keywords")
async def expand_keywords(
    data: ExpandKeywordsRequest,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    """Generate Google-Maps search variants for a seed term using Claude.
    Returns a list of strings the user can paste into the comma-separated
    search field to dramatically improve coverage."""
    import json
    from anthropic import AsyncAnthropic

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    api_key = ((org.anthropic_api_key if org else "") or "").strip() or __import__("os").getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada para esta organización")

    seed = data.seed.strip()
    if not seed:
        raise HTTPException(status_code=400, detail="Falta el término base")

    lang_label = "Spanish" if data.language == "es" else "English"
    prompt = (
        f"Generate up to 15 search-term variants that people actually type into "
        f"Google Maps to find the same kind of business as: \"{seed}\".\n\n"
        f"Rules:\n"
        f"- Output {lang_label} terms only.\n"
        f"- Include synonyms, related categories, and common misspellings or trade names.\n"
        f"- Each term must be a noun phrase (no full sentences).\n"
        f"- Exclude brand names of major chains/franchises.\n"
        f"- Return ONLY a JSON array of strings, nothing else."
    )

    client = AsyncAnthropic(api_key=api_key)
    try:
        resp = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=400,
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error de IA: {str(e)[:200]}")

    text_out = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text").strip()
    # Strip markdown code fences if present
    if text_out.startswith("```"):
        text_out = re.sub(r"^```(?:json)?\s*|\s*```$", "", text_out).strip()
    try:
        variants = json.loads(text_out)
    except Exception:
        # Fallback — split lines and clean
        variants = [ln.strip(" -•*\t").strip() for ln in text_out.splitlines() if ln.strip()]

    cleaned = []
    seen = set()
    for v in variants:
        if not isinstance(v, str):
            continue
        v = v.strip().strip(",.")
        key = v.lower()
        if not v or key in seen:
            continue
        seen.add(key)
        cleaned.append(v)
        if len(cleaned) >= 15:
            break

    return {"variants": cleaned}
