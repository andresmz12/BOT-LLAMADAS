from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import Organization, User
from services.auth import hash_password
from routes.auth import require_superadmin

router = APIRouter(prefix="/admin", tags=["admin"])


class OrgCreate(BaseModel):
    name: str
    logo_url: Optional[str] = None
    plan: str = "basic"
    retell_api_key: str = ""
    retell_phone_number: str = ""
    anthropic_api_key: str = ""
    is_active: bool = True


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "agent"
    organization_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    organization_id: Optional[int] = None
    is_active: Optional[bool] = None


@router.post("/organizations")
def create_org(
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = Organization(**data.dict())
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.get("/organizations")
def list_orgs(
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    return session.exec(select(Organization)).all()


@router.put("/organizations/{org_id}")
def update_org(
    org_id: int,
    data: OrgCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    org = session.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organización no encontrada")
    for k, v in data.dict().items():
        setattr(org, k, v)
    session.add(org)
    session.commit()
    session.refresh(org)
    return org


@router.post("/users")
def create_user(
    data: UserCreate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email ya en uso")
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        organization_id=data.organization_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    result = user.dict(exclude={"password_hash"})
    org = session.get(Organization, user.organization_id) if user.organization_id else None
    result["organization_name"] = org.name if org else ""
    return result


@router.get("/users")
def list_users(
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    users = session.exec(select(User)).all()
    result = []
    for u in users:
        d = u.dict(exclude={"password_hash"})
        org = session.get(Organization, u.organization_id) if u.organization_id else None
        d["organization_name"] = org.name if org else ""
        result.append(d)
    return result


@router.put("/users/{user_id}")
def update_user(
    user_id: int,
    data: UserUpdate,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(user, k, v)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.dict(exclude={"password_hash"})


@router.delete("/users/{user_id}")
def deactivate_user(
    user_id: int,
    _: User = Depends(require_superadmin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    user.is_active = False
    session.add(user)
    session.commit()
    return {"ok": True}
