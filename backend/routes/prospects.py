import csv
import io
import os
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
    min_rating: float = 0.0
    skip_closed: bool = True
    require_phone: bool = True
    language: str = "en"


def _brand_key(name: str) -> str:
    """Normalize a business name to its 'brand key' for deduplication.
    All-caps acronyms (CFSC, ACE, CVS...) are used as-is so all branches collapse to one key."""
    words_raw = name.strip().split()
    if words_raw and re.match(r'^[A-Z&]{2,6}$', words_raw[0]):
        return words_raw[0].lower()
    n = name.lower()
    n = re.sub(r'\b(inc|llc|corp|ltd|co|no|num|sucursal|branch|location|store|express)\b', '', n)
    n = re.sub(r'#\s*\d+', '', n)
    n = re.sub(r'\b\d+\b', '', n)
    n = re.sub(r'[^\w\s]', '', n)
    n = re.sub(r'\s+', ' ', n).strip()
    return n


# Common chain/franchise keywords — any business whose name contains one of these is skipped
_CHAIN_KEYWORDS = [
    # Check cashing / currency exchange chains
    "cfsc", "ace cash", "money mart", "check into cash", "cash america", "first cash",
    "checksmart", "speedy cash", "advance america", "titlemax", "titlebucks",
    "western union", "moneygram", "check n go", "check city", "world acceptance",

    # Banks / credit unions (large national)
    "chase bank", "wells fargo", "bank of america", "citibank", "td bank",
    "us bank", "pnc bank", "regions bank", "fifth third", "santander bank",
    "keybank", "suntrust", "bb&t", "truist", "huntington bank", "citizens bank",
    "capital one", "ally bank", "discover bank", "navy federal", "usaa",

    # Tax preparation chains
    "h&r block", "jackson hewitt", "liberty tax",

    # Big-box retail
    "walmart", "target", "costco", "sam's club", "bj's wholesale",
    "home depot", "lowe's", "menards", "ace hardware", "true value",
    "best buy", "staples", "office depot", "officemax",

    # Grocery chains
    "kroger", "safeway", "albertsons", "publix", "h-e-b", "aldi",
    "whole foods", "trader joe's", "meijer", "food lion", "giant eagle",
    "stop & shop", "wegmans", "sprouts", "smart & final",

    # Dollar / discount stores
    "dollar general", "dollar tree", "family dollar", "five below",

    # Pharmacy chains
    "cvs pharmacy", "walgreens", "rite aid", "duane reade",

    # Fast food / QSR
    "mcdonald", "burger king", "wendy's", "taco bell", "subway",
    "domino", "pizza hut", "papa john", "little caesars", "papa murphy",
    "kfc", "popeyes", "chick-fil-a", "raising cane",
    "chipotle", "qdoba", "moe's southwest",
    "dunkin", "starbucks", "tim hortons", "peet's coffee",
    "sonic drive", "dairy queen", "baskin robbins", "cold stone",
    "five guys", "shake shack", "whataburger", "culver's",
    "arby's", "hardee's", "carl's jr",
    "ihop", "denny's", "cracker barrel", "applebee's", "chili's",
    "olive garden", "red lobster", "outback steakhouse", "longhorn steakhouse",
    "panda express", "wingstop", "buffalo wild wings", "wingstop",
    "panera bread", "jersey mike", "jimmy john", "firehouse subs",
    "moe's", "el pollo loco", "del taco", "jack in the box",

    # Auto parts / service chains
    "autozone", "advance auto", "o'reilly", "napa auto",
    "jiffy lube", "valvoline", "pep boys", "midas", "meineke",
    "firestone", "goodyear", "discount tire", "mavis discount",
    "oil can henry", "express oil",

    # Gas stations / convenience
    "shell", "exxon", "chevron", "bp station", "circle k", "speedway",
    "marathon oil", "marathon gas", "mobil", "sunoco", "gulf station",
    "pilot travel", "flying j", "wawa", "sheetz", "kwik trip",
    "casey's general", "love's travel", "road ranger",

    # Telecom retail
    "t-mobile", "at&t store", "verizon wireless", "sprint store",
    "metro by t-mobile", "cricket wireless", "boost mobile",

    # Hotels / lodging chains
    "marriott", "hilton", "hyatt", "holiday inn", "hampton inn",
    "comfort inn", "best western", "motel 6", "super 8", "days inn",
    "extended stay", "residence inn", "courtyard by marriott",
    "fairfield inn", "la quinta", "quality inn",

    # Shipping / postal chains
    "ups store", "fedex office", "the ups store",

    # Fitness chains
    "planet fitness", "anytime fitness", "la fitness", "24 hour fitness",
    "gold's gym", "ymca", "crunch fitness", "equinox",

    # Urgent care / healthcare chains
    "minuteclinic", "concentra", "nextcare", "american family care",
    "patient first", "gohealth urgent", "medexpress",

    # Insurance chains
    "state farm", "allstate", "farmers insurance", "liberty mutual",

    # Real estate chains
    "re/max", "keller williams", "century 21", "coldwell banker",
]


@router.post("/search-apify")
async def search_apify_prospects(
    data: ApifySearchRequest,
    current_user: User = Depends(require_pro_plan),
    session: Session = Depends(get_session),
):
    import asyncio
    import httpx
    from models import Organization

    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    if not org or not org.apify_enabled:
        raise HTTPException(status_code=403, detail="Búsqueda con IA no habilitada para esta organización")

    api_token = (org.apify_api_token or "").strip() or os.getenv("APIFY_API_TOKEN", "")
    if not api_token:
        raise HTTPException(status_code=503, detail="Token de Apify no configurado para esta organización")

    campaign = session.get(Campaign, data.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")

    # Build exclude list (unchanged existing logic)
    user_excludes = [kw.strip().lower() for kw in data.exclude_keywords.split(",") if kw.strip()]
    chain_excludes = _CHAIN_KEYWORDS if data.exclude_chains else []
    all_excludes = user_excludes + chain_excludes

    # Build location query — prepend zone if provided
    location_query = f"{data.zone.strip()}, {data.location}" if data.zone.strip() else data.location
    search_query = f"{data.search_term} in {location_query}"

    actor_input = {
        "searchStrings": [search_query],
        "maxCrawledPlacesPerSearch": min(data.max_results * 3, 500),
        "includeHistogram": False,
        "includeOpeningHours": False,
        "includePeopleAlsoSearchFor": False,
        "language": data.language,
        "skipClosedPlaces": data.skip_closed,
    }
    if data.min_rating > 0:
        actor_input["minimumStars"] = data.min_rating

    async with httpx.AsyncClient(timeout=200) as client:
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
            raise HTTPException(status_code=502, detail=f"Apify run terminó con estado: {run_status}")

        items_resp = await client.get(
            f"https://api.apify.com/v2/actor-runs/{run_id}/dataset/items",
            headers={"Authorization": f"Bearer {api_token}"},
            params={"format": "json", "limit": min(data.max_results * 3, 500)},
        )
        items = items_resp.json() if items_resp.status_code == 200 else []

    # Deduplicate by brand — keep highest reviewsCount per brand key
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

    imported = 0
    skipped_no_phone = 0
    skipped_no_reviews = 0
    skipped_excluded = 0

    for item in items:
        if imported >= data.max_results:
            break

        # Filter by min_reviews
        if data.min_reviews > 0:
            reviews = item.get("reviewsCount") or item.get("numRatings") or 0
            if reviews < data.min_reviews:
                skipped_no_reviews += 1
                continue

        phone_raw = (item.get("phone") or item.get("phoneUnformatted") or "").strip()
        if data.require_phone and not phone_raw:
            skipped_no_phone += 1
            continue

        name = (item.get("title") or item.get("name") or "").strip()
        name_lower = name.lower()

        # Apply exclude filters (existing logic unchanged)
        if any(kw in name_lower for kw in all_excludes):
            skipped_excluded += 1
            continue

        phone = normalize_phone(phone_raw, "+1") if phone_raw else ""
        address = (item.get("address") or item.get("street") or "").strip()
        rating = item.get("totalScore") or item.get("rating") or 0
        notes_parts = []
        if address:
            notes_parts.append(address)
        if rating:
            notes_parts.append(f"Rating: {rating}")

        session.add(Prospect(
            campaign_id=data.campaign_id,
            name=name,
            phone=phone,
            company=name,
            notes=" | ".join(notes_parts) or None,
            organization_id=current_user.organization_id,
        ))
        imported += 1

    session.commit()
    return {
        "imported": imported,
        "total_found": len(items),
        "skipped_no_phone": skipped_no_phone,
        "skipped_no_reviews": skipped_no_reviews,
        "skipped_duplicates": skipped_duplicates,
        "skipped_excluded": skipped_excluded,
    }


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
