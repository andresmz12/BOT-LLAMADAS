from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlmodel import Session, select
from typing import Optional
from database import get_session
from models import User, Organization
from routes.auth import get_current_user, require_write_access
from services.auth import hash_password

router = APIRouter(prefix="/team", tags=["team"])

ALLOWED_ROLES = {"agent"}  # admin can only create agents


class TeamMemberCreate(BaseModel):
    email: str
    password: str
    full_name: str
    role: str = "agent"

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres")
        if len(v) > 128:
            raise ValueError("Contraseña demasiado larga")
        return v

    @field_validator("email")
    @classmethod
    def email_length(cls, v: str) -> str:
        if len(v) > 254:
            raise ValueError("Email demasiado largo")
        return v.strip().lower()


class TeamMemberUpdate(BaseModel):
    full_name: Optional[str] = None
    is_active: Optional[bool] = None


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "superadmin"):
        raise HTTPException(403, "Se requiere rol de administrador")
    return current_user


@router.get("")
def list_team(
    current_user: User = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    users = session.exec(
        select(User).where(
            User.organization_id == current_user.organization_id,
            User.role != "superadmin",
        )
    ).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "full_name": u.full_name,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]


@router.post("")
def create_team_member(
    data: TeamMemberCreate,
    current_user: User = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    if data.role not in ALLOWED_ROLES:
        raise HTTPException(400, f"Solo puedes crear usuarios con rol: {', '.join(ALLOWED_ROLES)}")
    existing = session.exec(select(User).where(User.email == data.email)).first()
    if existing:
        raise HTTPException(400, "Ya existe un usuario con ese email")
    user = User(
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        role=data.role,
        organization_id=current_user.organization_id,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return {"id": user.id, "email": user.email, "full_name": user.full_name, "role": user.role}


@router.put("/{user_id}")
def update_team_member(
    user_id: int,
    data: TeamMemberUpdate,
    current_user: User = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user or user.organization_id != current_user.organization_id:
        raise HTTPException(404, "Usuario no encontrado")
    if user.role in ("admin", "superadmin"):
        raise HTTPException(403, "No puedes modificar administradores")
    if data.full_name is not None:
        user.full_name = data.full_name
    if data.is_active is not None:
        user.is_active = data.is_active
    session.add(user)
    session.commit()
    return {"ok": True}


@router.delete("/{user_id}")
def delete_team_member(
    user_id: int,
    current_user: User = Depends(_require_admin),
    session: Session = Depends(get_session),
):
    user = session.get(User, user_id)
    if not user or user.organization_id != current_user.organization_id:
        raise HTTPException(404, "Usuario no encontrado")
    if user.role in ("admin", "superadmin"):
        raise HTTPException(403, "No puedes eliminar administradores")
    if user.id == current_user.id:
        raise HTTPException(400, "No puedes eliminarte a ti mismo")
    session.delete(user)
    session.commit()
    return {"ok": True}
