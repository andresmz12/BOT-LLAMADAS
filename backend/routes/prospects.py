import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from pydantic import BaseModel, field_validator
from typing import Optional
from database import get_session
from models import Prospect, Campaign, AgentConfig, Call, User, Organization
from routes.auth import get_current_user, require_write_access, require_pro_plan

router = APIRouter(prefix="/prospects", tags=["prospects"])


def _validate_phone(v: str) -> str:
    import re
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
        phone=data.phone,
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
        # When file has "contact" column → contact=person name, name=company
        # When file has only "name" column → name=person name
        has_contact = "contact" in row
        name = (row.get("contact") or row.get("name") or "").strip()
        company = (row.get("company") or (row.get("name") if has_contact else "") or "").strip()
        email = (row.get("email") or "").strip()
        import re
        if not phone or not re.match(r"^\+?[\d\s\-().]{7,20}$", phone):
            continue
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
