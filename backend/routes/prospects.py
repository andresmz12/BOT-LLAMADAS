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
    if data.campaign_id:
        camp = session.get(Campaign, data.campaign_id)
        if not camp or (current_user.role != "superadmin" and camp.organization_id != current_user.organization_id):
            raise HTTPException(status_code=403, detail="Campaña no encontrada o sin acceso")
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

    # Pre-load existing phones in the org to skip duplicates across all campaigns
    existing_phones: set[str] = set()
    if current_user.organization_id:
        existing_phones = {
            p for p in session.exec(
                select(Prospect.phone).where(Prospect.organization_id == current_user.organization_id)
            ).all()
            if p
        }

    imported = 0
    skipped_existing = 0
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
        if phone in existing_phones:
            skipped_existing += 1
            continue
        existing_phones.add(phone)  # prevent duplicates within the same file too
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
    return {"imported": imported, "skipped_existing": skipped_existing}


@router.get("")
def list_prospects(
    campaign_id: int | None = None,
    email_only: bool = False,
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if email_only:
        query = query.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
        query = query.where(Prospect.campaign_id == campaign_id)
    if status:
        query = query.where(Prospect.status == status)
    prospects = session.exec(query).all()
    return [p.model_dump(exclude={"campaign", "calls"}) for p in prospects]


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
    if not prospect.phone:
        raise HTTPException(status_code=400, detail="Este prospecto no tiene teléfono y no puede ser llamado")
    if not prospect.campaign_id:
        raise HTTPException(status_code=400, detail="Este prospecto es solo de email y no pertenece a una campaña de llamadas")

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
    email_only: bool = False,
    status: str | None = None,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    """Reset prospects to 'pending' so they get dialed again on the next campaign run."""
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if email_only:
        query = query.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
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
    email_only: bool = False,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    query = select(Prospect)
    if current_user.role != "superadmin":
        query = query.where(Prospect.organization_id == current_user.organization_id)
    if email_only:
        query = query.where(Prospect.campaign_id == None)  # noqa: E711
    elif campaign_id:
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

    import os as _os
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    org_key = ((org.anthropic_api_key if org else "") or "").strip()
    env_key = _os.getenv("ANTHROPIC_API_KEY", "").strip()

    # Try org key first; if it fails 401, automatically fall back to the env
    # key so a stale per-org credential doesn't block the whole feature when
    # Railway has a valid platform-wide key.
    candidates = []
    if org_key:
        candidates.append(("org", org_key))
    if env_key and env_key != org_key:
        candidates.append(("env", env_key))
    if not candidates:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada (ni en la organización ni en el entorno)")

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

    resp = None
    last_err: Exception | None = None
    for source, key in candidates:
        try:
            resp = await AsyncAnthropic(api_key=key).messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=400,
                messages=[{"role": "user", "content": prompt}],
            )
            break
        except Exception as e:
            last_err = e
            msg = str(e).lower()
            # Only retry the next candidate when it's an auth issue with the
            # current key. Rate limits / credit issues won't be solved by a
            # different key, so surface them immediately.
            if "401" not in msg and "invalid x-api-key" not in msg and "authentication" not in msg:
                break
            continue

    if resp is None:
        msg = str(last_err or "").lower()
        if "401" in msg or "invalid x-api-key" in msg or "authentication" in msg:
            raise HTTPException(
                status_code=401,
                detail="API key de Anthropic inválida tanto en la organización como en el entorno. Actualízala en Admin Panel → Organizaciones."
            )
        if "429" in msg or "rate" in msg:
            raise HTTPException(status_code=429, detail="Anthropic rate limit alcanzado. Intenta en unos segundos.")
        if "credit" in msg or "balance" in msg:
            raise HTTPException(status_code=402, detail="Cuenta de Anthropic sin créditos. Recarga en console.anthropic.com.")
        raise HTTPException(status_code=502, detail=f"Error de IA: {str(last_err)[:200]}")

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
