import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import Prospect, Campaign, AgentConfig, Call

router = APIRouter(prefix="/prospects", tags=["prospects"])


class ProspectCreate(BaseModel):
    campaign_id: int
    name: str
    phone: str
    company: Optional[str] = None
    notes: Optional[str] = None


@router.post("", response_model=Prospect)
def create_prospect(data: ProspectCreate, session: Session = Depends(get_session)):
    prospect = Prospect(
        campaign_id=data.campaign_id,
        name=data.name,
        phone=data.phone,
        company=data.company or None,
        notes=data.notes or None,
    )
    session.add(prospect)
    session.commit()
    session.refresh(prospect)
    return prospect


@router.post("/import")
async def import_file(
    campaign_id: int = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    content = await file.read()
    filename = (file.filename or "").lower()
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
        rows = list(reader)

    imported = 0
    for row in rows:
        name = row.get("name", "").strip()
        phone = row.get("phone", "").strip()
        company = row.get("company", "").strip()
        if not name or not phone:
            continue
        session.add(Prospect(campaign_id=campaign_id, name=name, phone=phone, company=company or None))
        imported += 1
    session.commit()
    return {"imported": imported}


@router.get("")
def list_prospects(
    campaign_id: int | None = None,
    status: str | None = None,
    session: Session = Depends(get_session),
):
    query = select(Prospect)
    if campaign_id:
        query = query.where(Prospect.campaign_id == campaign_id)
    if status:
        query = query.where(Prospect.status == status)
    return session.exec(query).all()


@router.put("/{prospect_id}", response_model=Prospect)
def update_prospect(prospect_id: int, data: Prospect, session: Session = Depends(get_session)):
    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    for field, value in data.dict(exclude_unset=True, exclude={"id"}).items():
        setattr(prospect, field, value)
    session.add(prospect)
    session.commit()
    session.refresh(prospect)
    return prospect


@router.post("/{prospect_id}/call")
async def call_prospect(prospect_id: int, session: Session = Depends(get_session)):
    from services import vapi_client
    from services.call_orchestrator import build_system_prompt

    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecto no encontrado")

    campaign = session.get(Campaign, prospect.campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaña no encontrada")

    agent = session.get(AgentConfig, campaign.agent_config_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agente no encontrado")

    call = Call(prospect_id=prospect.id, campaign_id=campaign.id, status="initiated")
    session.add(call)
    session.commit()
    session.refresh(call)

    try:
        result = await vapi_client.create_call(prospect.phone, build_system_prompt(agent), agent)
        call.vapi_call_id = result.get("id", "")
        call.status = "in-progress"
        prospect.status = "calling"
        prospect.call_attempts += 1
        prospect.last_called_at = datetime.utcnow()
        session.add(call)
        session.add(prospect)
        session.commit()
        return {"call_id": call.id, "vapi_call_id": call.vapi_call_id, "status": "in-progress"}
    except Exception as e:
        call.status = "failed"
        session.add(call)
        session.commit()
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{prospect_id}")
def delete_prospect(prospect_id: int, session: Session = Depends(get_session)):
    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    session.delete(prospect)
    session.commit()
    return {"ok": True}
