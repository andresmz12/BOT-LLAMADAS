import csv
import io
import re
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from pydantic import BaseModel
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


class ProspectCreate(BaseModel):
    campaign_id: int
    name: str
    phone: str
    company: Optional[str] = None
    notes: Optional[str] = None


class ProspectUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


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
        if not phone:
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
    max_results: int = 50
    exclude_keywords: str = ""      # comma-separated: "walmart, mcdonald, corp"
    exclude_chains: bool = True     # exclude obvious chains/franchises
    min_rating: float = 0.0         # 0 = all, 3.5 = only 3.5+ stars
    skip_closed: bool = True        # skip permanently closed places
    require_phone: bool = True      # only import if has phone number
    language: str = "en"


# Common chain/franchise keywords to filter out automatically
_CHAIN_KEYWORDS = [
    "walmart", "mcdonald", "starbucks", "burger king", "wendy's", "taco bell",
    "domino", "pizza hut", "subway", "dunkin", "7-eleven", "cvs", "walgreens",
    "dollar general", "dollar tree", "family dollar", "target", "costco",
    "home depot", "lowe's", "autozone", "advance auto", "o'reilly",
    "chase bank", "wells fargo", "bank of america", "citibank", "td bank",
    "h&r block", "jackson hewitt", "liberty tax",
    "shell", "exxon", "chevron", "bp ", "circle k", "speedway",
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

    # Build exclude list
    user_excludes = [kw.strip().lower() for kw in data.exclude_keywords.split(",") if kw.strip()]
    chain_excludes = _CHAIN_KEYWORDS if data.exclude_chains else []
    all_excludes = user_excludes + chain_excludes

    search_query = f"{data.search_term} in {data.location}"

    actor_input = {
        "searchStrings": [search_query],
        "maxCrawledPlacesPerSearch": min(data.max_results * 3, 500),  # fetch extra to account for filtered-out
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

    imported = 0
    skipped_no_phone = 0
    skipped_excluded = 0

    for item in items:
        if imported >= data.max_results:
            break

        phone_raw = (item.get("phone") or item.get("phoneUnformatted") or "").strip()
        if data.require_phone and not phone_raw:
            skipped_no_phone += 1
            continue

        name = (item.get("title") or item.get("name") or "").strip()
        name_lower = name.lower()

        # Apply exclude filters
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
