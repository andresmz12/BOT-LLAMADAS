import os
import json
import logging
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un analizador estricto de transcripciones de llamadas de ventas.
Dado un transcript, devuelve SOLO un JSON válido con este schema:
{
  "client_said": ["puntos clave que dijo el cliente"],
  "agent_said": ["acciones y ofertas del agente"],
  "outcome": "<ver reglas>",
  "services_mentioned": ["servicios mencionados"],
  "sentiment": "positive | neutral | negative",
  "appointment_scheduled": false,
  "appointment_date": null,
  "notes": "observación más importante en una sola línea"
}

REGLAS ESTRICTAS PARA outcome (aplica en orden de prioridad):

1. "appointment_scheduled" — el prospecto aceptó una cita o reunión con fecha/hora concreta.

2. "interested" — SOLO si ocurre al menos uno de estos:
   - Preguntó activamente por comisiones, precios o detalles del programa/servicio.
   - Aceptó una visita o llamada de seguimiento sin fecha fija.
   - Pidió información específica, catálogo o datos de contacto.

3. "callback_requested" — el prospecto dijo frases como:
   "Llámeme después", "Estoy ocupado", "Mañana", "Ahorita no puedo",
   "Estoy en reunión", "En otro momento", "Más tarde".

4. "not_interested" — si cualquiera de estas condiciones:
   - Dijo explícitamente "no me interesa", "no gracias", "no quiero".
   - Dijo que ya tiene el servicio/producto: "ya tengo", "ya cuento con", "ya tenemos",
     "ya tengo otro proveedor", "ya tenemos uno", "ya tenemos contratado", "ya lo tenemos".
   - Dijo "no lo necesito", "no aplica", "no es para nosotros", "no estamos interesados".
   - Colgó sin responder nada relevante.
   - La conversación duró menos de 20 segundos sin mostrar interés real.

5. "wrong_number" — contestó alguien equivocado o el número no corresponde al prospecto.

6. "voicemail" — nunca contestó una persona real (grabación automática, buzón de voz).

7. "no_answer" — no contestaron o la llamada no conectó.

Si el transcript está vacío o tiene menos de 20 palabras, usa "no_answer".
Responde SOLO con el JSON válido, sin texto adicional, sin markdown, sin backticks."""


async def analyze_transcript(transcript: str, api_key: str = "") -> dict:
    if not transcript or not transcript.strip():
        return _empty_result()

    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not api_key:
        logger.warning("No Anthropic API key available for transcript analysis")
        return _empty_result()

    client = AsyncAnthropic(api_key=api_key)
    try:
        message = await client.messages.create(
            model="claude-sonnet-4-6",
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
        "outcome": None,
        "services_mentioned": [],
        "sentiment": "neutral",
        "appointment_scheduled": False,
        "appointment_date": None,
        "notes": "",
    }
