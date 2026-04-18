from fastapi import APIRouter, Depends
from sqlmodel import Session
from database import get_session
from models import User, Organization
from routes.auth import get_current_user, require_write_access

router = APIRouter(prefix="/settings", tags=["settings"])

SECRET_FIELDS = {"retell_api_key", "anthropic_api_key"}
CREDENTIAL_FIELDS = {"retell_api_key", "retell_phone_number", "anthropic_api_key"}


def _mask(value: str) -> str:
    if not value:
        return ""
    return "***" + value[-4:] if len(value) > 4 else "****"


@router.get("")
def get_settings(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, current_user.organization_id) if current_user.organization_id else None
    retell_key = org.retell_api_key if org else ""
    anthropic_key = org.anthropic_api_key if org else ""
    return {
        "retell_api_key": _mask(retell_key),
        "retell_phone_number": org.retell_phone_number if org else "",
        "anthropic_api_key": _mask(anthropic_key),
        "retell_api_key_configured": bool(retell_key),
        "anthropic_api_key_configured": bool(anthropic_key),
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
                    if key in SECRET_FIELDS and str(value).startswith("***"):
                        continue  # unchanged masked value — don't overwrite
                    setattr(org, key, str(value))
            session.add(org)
            session.commit()
    return {"ok": True}
