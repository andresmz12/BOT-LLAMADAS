from fastapi import APIRouter, Depends
from sqlmodel import Session, select
from database import get_session
from models import Settings

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("")
def get_settings(session: Session = Depends(get_session)):
    settings = session.exec(select(Settings)).all()
    return {s.key: s.value for s in settings}


@router.post("")
def save_settings(data: dict, session: Session = Depends(get_session)):
    for key, value in data.items():
        existing = session.exec(select(Settings).where(Settings.key == key)).first()
        if existing:
            existing.value = str(value)
            session.add(existing)
        else:
            session.add(Settings(key=key, value=str(value)))
    session.commit()
    return {"ok": True}
