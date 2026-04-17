from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from pydantic import BaseModel
from typing import Optional
from database import get_session
from models import User, Organization
from routes.auth import get_current_user
from services.auth import hash_password

router = APIRouter(prefix="/users", tags=["users"])


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "agent"
    organization_id: Optional[int] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("")
def list_org_users(
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role == "superadmin":
        users = session.exec(select(User)).all()
    elif current_user.role == "admin":
        users = session.exec(
            select(User).where(User.organization_id == current_user.organization_id)
        ).all()
    else:
        return []
    result = []
    for u in users:
        d = u.dict(exclude={"password_hash"})
        org = session.get(Organization, u.organization_id) if u.organization_id else None
        d["organization_name"] = org.name if org else ""
        result.append(d)
    return result


@router.post("")
def create_org_user(
    data: UserCreate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    if current_user.role == "admin":
        if data.role == "superadmin":
            raise HTTPException(status_code=403, detail="No puedes crear superadmins")
        data.organization_id = current_user.organization_id
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


@router.put("/{user_id}")
def update_org_user(
    user_id: int,
    data: UserUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if current_user.role == "admin" and user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    for k, v in data.dict(exclude_unset=True).items():
        setattr(user, k, v)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.dict(exclude={"password_hash"})


@router.delete("/{user_id}")
def deactivate_org_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Acceso denegado")
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado")
    if current_user.role == "admin" and user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="Acceso denegado")
    user.is_active = False
    session.add(user)
    session.commit()
    return {"ok": True}
