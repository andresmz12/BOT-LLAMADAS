import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import Prospect

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


@router.delete("/{prospect_id}")
def delete_prospect(prospect_id: int, session: Session = Depends(get_session)):
    prospect = session.get(Prospect, prospect_id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospect not found")
    session.delete(prospect)
    session.commit()
    return {"ok": True}
