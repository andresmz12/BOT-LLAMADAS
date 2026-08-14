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
