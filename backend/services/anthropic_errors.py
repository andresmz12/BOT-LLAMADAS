import os
from typing import Awaitable, Callable, Optional, TypeVar

T = TypeVar("T")


def anthropic_key_candidates(org: Optional[object]) -> list[str]:
    """Org's saved Anthropic key first, then the platform-wide Railway env
    key as a fallback candidate (deduplicated, in try-order)."""
    org_key = ((getattr(org, "anthropic_api_key", None) or "") if org else "").strip()
    env_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
    candidates = []
    if org_key:
        candidates.append(org_key)
    if env_key and env_key != org_key:
        candidates.append(env_key)
    return candidates


async def call_with_anthropic_fallback(org: Optional[object], call_fn: Callable[[str], Awaitable[T]]) -> T:
    """Run call_fn(api_key) with the org's Anthropic key; if it fails with an
    auth error (401 / invalid key), retry once with the platform-wide
    ANTHROPIC_API_KEY env var. This way a single org's stale/expired
    credential doesn't block a feature when Railway has a valid
    platform-wide key configured. Non-auth errors (rate limit, no credits,
    overloaded) are raised immediately without retrying a different key.

    Raises ValueError("NO_ANTHROPIC_KEY") if neither key is configured.
    """
    candidates = anthropic_key_candidates(org)
    if not candidates:
        raise ValueError("NO_ANTHROPIC_KEY")

    last_err: Exception | None = None
    for key in candidates:
        try:
            return await call_fn(key)
        except Exception as e:
            last_err = e
            msg = str(e).lower()
            if "401" not in msg and "invalid x-api-key" not in msg and "authentication" not in msg:
                raise
    raise last_err


def friendly_anthropic_error(e: Exception) -> str:
    """Turn a raw Anthropic SDK exception into an actionable, user-facing
    message. Anthropic's error bodies stringify as a literal Python dict
    (e.g. "Error code: 401 - {'type': 'error', 'error': {...}}"), which is
    meaningless to an end user if leaked directly into an HTTPException detail."""
    msg = str(e).lower()
    if "401" in msg or "invalid x-api-key" in msg or "authentication" in msg:
        return "La clave de Anthropic configurada no es válida. Actualízala en Configuración."
    if "429" in msg or "rate" in msg:
        return "Anthropic rate limit alcanzado. Intenta en unos segundos."
    if "credit" in msg or "balance" in msg:
        return "Cuenta de Anthropic sin créditos. Recarga en console.anthropic.com."
    if "overloaded" in msg or "529" in msg:
        return "El servicio de IA está saturado en este momento. Intenta de nuevo en unos segundos."
    return f"No se pudo completar la solicitud con IA: {str(e)[:150]}"
