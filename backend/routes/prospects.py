import csv
import io
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlmodel import Session, select
from database import get_session
from models import Prospect

router = APIRouter(prefix="/prospects", tags=["prospects"])


@router.post("/import")
async def import_csv(
    campaign_id: int = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    imported = 0
    for row in reader:
        name = row.get("name", "").strip()
        phone = row.get("phone", "").strip()
        company = row.get("company", "").strip()
        if not name or not phone:
            continue
        prospect = Prospect(campaign_id=campaign_id, name=name, phone=phone, company=company or None)
        session.add(prospect)
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
