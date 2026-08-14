import logging
from datetime import datetime, timedelta

from sqlmodel import Session

from models import AuditLog, User

logger = logging.getLogger(__name__)

RETENTION_DAYS = 60


def log_action(session: Session, user: User | None, action: str, details: str = "", ip_address: str | None = None) -> None:
    """Best-effort audit trail entry. Never raises — a failed audit write must
    not break the action it's recording."""
    try:
        entry = AuditLog(
            user_id=user.id if user else None,
            user_email=user.email if user else "",
            organization_id=user.organization_id if user else None,
            action=action,
            details=details[:500],
            ip_address=ip_address,
        )
        session.add(entry)
        session.commit()
    except Exception as e:
        logger.error(f"[AuditLog] failed to record action={action}: {e}")


def purge_old_entries(session: Session) -> int:
    """Delete audit log rows older than RETENTION_DAYS. Returns rows deleted."""
    from sqlalchemy import delete as sql_delete

    cutoff = datetime.utcnow() - timedelta(days=RETENTION_DAYS)
    result = session.execute(sql_delete(AuditLog).where(AuditLog.created_at < cutoff))
    session.commit()
    return result.rowcount or 0
