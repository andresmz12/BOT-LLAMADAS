from fastapi import APIRouter, Depends
from sqlmodel import Session
from database import get_session
from models import User, Organization
from routes.auth import get_current_user, require_write_access

router = APIRouter(prefix="/settings", tags=["settings"])

CREDENTIAL_FIELDS = {"retell_api_key", "retell_phone_number", "anthropic_api_key"}


@router.get("")
def get_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    return {
        "retell_api_key": org.retell_api_key if org else "",
        "retell_phone_number": org.retell_phone_number if org else "",
        "anthropic_api_key": org.anthropic_api_key if org else "",
    }


@router.post("")
def save_settings(
    data: dict,
    current_user: User = Depends(require_write_access),
    session: Session = Depends(get_session),
):
    if current_user.organization_id:
        org = session.get(Organization, current_user.organization_id)
        if org:
            for key, value in data.items():
                if key in CREDENTIAL_FIELDS:
                    setattr(org, key, str(value))
            session.add(org)
            session.commit()
    return {"ok": True}
