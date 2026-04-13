import os
import json
import logging
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un analizador de transcripciones de llamadas de ventas.
Dado un transcript, extrae y devuelve SOLO un JSON con este schema:
{
  "client_said": ["array de strings - puntos clave que dijo el cliente"],
  "agent_said": ["array de strings - acciones y ofertas del agente"],
  "outcome": "uno de: interested / not_interested / callback_requested / appointment_scheduled / voicemail / wrong_number / failed",
  "services_mentioned": ["array de nombres de servicios mencionados"],
  "sentiment": "uno de: positive / neutral / negative",
  "appointment_scheduled": false,
  "appointment_date": null,
  "notes": "string de una línea con la observación más importante"
}
Responde SOLO con el JSON válido, sin texto adicional, sin markdown, sin backticks."""


async def analyze_transcript(transcript: str) -> dict:
    if not transcript or not transcript.strip():
        return _empty_result()

    api_key = os.getenv("ANTHROPIC_API_KEY", "")
    if not api_key:
        try:
            from sqlmodel import Session, select
            from database import engine
            from models import Settings
            with Session(engine) as s:
                row = s.exec(select(Settings).where(Settings.key == "anthropic_api_key")).first()
                if row:
                    api_key = row.value
        except Exception:
            pass

    client = AsyncAnthropic(api_key=api_key)
    try:
        message = await client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": transcript}],
        )
        text = message.content[0].text.strip()
        return json.loads(text)
    except Exception as e:
        logger.error(f"Error analyzing transcript: {e}")
        return _empty_result()


def _empty_result() -> dict:
    return {
        "client_said": [],
        "agent_said": [],
        "outcome": "failed",
        "services_mentioned": [],
        "sentiment": "neutral",
        "appointment_scheduled": False,
        "appointment_date": None,
        "notes": "",
    }
