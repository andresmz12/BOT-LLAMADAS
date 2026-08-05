import os
import json
import logging
from anthropic import AsyncAnthropic

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Eres un analizador estricto de transcripciones de llamadas de ventas.
Se te proporciona un transcript y opcionalmente la duración de la llamada en segundos al inicio.
Devuelve SOLO un JSON válido con este schema:
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

1. "appointment_scheduled" — el prospecto aceptó una cita, reunión, o servicio con fecha/hora concreta. Incluye, entre otros:
   - Cita o reunión de ventas con fecha/hora acordada (caso general).
   - Recogida de paquetería (pickup): el cliente confirmó la DIRECCIÓN donde pasarán a recoger el paquete/envío
     Y una fecha u hora (aunque sea aproximada: "mañana en la tarde", "el viernes a las 3", "hoy antes de las 6")
     para que el mensajero pase por él. No hace falta lenguaje de "cita" o "reunión" — confirmar dirección + horario
     de recogida ya cuenta como appointment_scheduled.
   Cuando el outcome sea "appointment_scheduled", el campo booleano "appointment_scheduled" del JSON debe ser true;
   en cualquier otro outcome debe ser false. Si detectaste fecha/hora, usa "appointment_date" en formato ISO 8601
   (ej. "2026-08-05T15:00:00"); si el cliente solo dio una referencia aproximada sin fecha exacta, infiere la fecha
   más razonable a partir de la duración/fecha de la llamada o usa null si es imposible de determinar.

2. "interested" — SOLO si el cliente muestra interés CONCRETO y ACTIVO. Requiere al menos uno:
   - Proporcionó su correo electrónico, WhatsApp u otro dato de contacto para recibir información.
   - Pidió explícitamente que le envíen información, un catálogo o una propuesta.
   - Preguntó activamente por precios, costos o condiciones del servicio del agente.
   - Aceptó una llamada o reunión de seguimiento con compromiso claro.
   - Dijo frases como: "me interesa", "mándame información", "¿cuánto cuesta?", "¿cómo funciona?", "quiero saber más".
   NO cuenta como interés:
   - Responder preguntas del agente sobre su propio negocio.
   - Escuchar la presentación sin pedir nada.
   - Mantener conversación cortés y colgar sin comprometerse a nada.

3. "callback_requested" — cualquiera de estas situaciones:
   - La persona buscada NO estaba disponible: "no está", "no se encuentra", "está ocupado",
     "no está en este momento", "ahorita no puede", "está en una junta", "no está aquí".
   - El prospecto dijo que no es buen momento: "Llámeme después", "Estoy ocupado", "Mañana",
     "Ahorita no puedo", "En otro momento", "Más tarde", "Ahora no es buen momento", "Te llamo yo".
   - Contestó, escuchó la presentación, respondió algunas preguntas pero colgó sin mostrar
     interés claro NI rechazar explícitamente — hay que intentar de nuevo.

4. "not_interested" — SOLO si hubo rechazo EXPLÍCITO y definitivo:
   - Dijo claramente: "no me interesa", "no gracias", "no quiero", "no, gracias".
   - Dijo que ya tiene el servicio: "ya tengo", "ya cuento con", "ya tenemos",
     "ya tengo otro proveedor", "ya tenemos contratado", "ya estamos con alguien".
   - Dijo: "no lo necesito", "no aplica", "no es para nosotros", "no estamos interesados",
     "no nos interesa", "no busco eso".
   IMPORTANTE: La duda, el silencio o colgar sin rechazar NO es not_interested — usa callback_requested.

5. "wrong_number" — contestó alguien equivocado, marcó error, o el número no corresponde al prospecto buscado.

6. "voicemail" — nunca contestó una persona real. Indicadores:
   - El transcript contiene frases automáticas como: "deje su mensaje", "buzón de voz",
     "deje un mensaje después del tono", "marque para dejar un mensaje",
     "please leave a message", "leave a message after the tone", "not available right now".
   - El transcript es solo frases automáticas sin ninguna respuesta humana real.

7. "no_answer" — no contestaron o la llamada no conectó:
   - La llamada duró menos de 10 segundos Y el transcript está vacío o solo contiene palabras del agente.
   - Nadie respondió, línea ocupada, o llamada desconectada antes de que alguien hablara.

Si el transcript está vacío o tiene menos de 10 palabras, usa "no_answer".

REGLAS PARA sentiment (evalúa la actitud del cliente, no la del agente):
- "positive" — el cliente aceptó una cita, servicio o recogida; mostró interés
  explícito; pidió información o precios; o se mostró receptivo y colaborativo.
  Si el outcome es "appointment_scheduled" o "interested", sentiment DEBE ser
  "positive" salvo que el cliente haya aceptado con molestia evidente.
- "negative" — el cliente rechazó explícitamente, se mostró molesto, irritado o
  cortante, o colgó de forma abrupta.
- "neutral" — SOLO cuando no hay señal emocional clara: contestó de forma breve
  y cortés sin comprometerse, o la llamada fue puramente informativa.
  No uses "neutral" como valor por defecto cuando sí hubo una señal clara."""

MODEL = "claude-sonnet-5"

_OUTCOMES = [
    "appointment_scheduled", "interested", "callback_requested",
    "not_interested", "wrong_number", "voicemail", "no_answer",
]

# Nullable fields use anyOf rather than a ["string", "null"] type array: only
# anyOf is documented as supported by structured outputs.
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "client_said": {"type": "array", "items": {"type": "string"}},
        "agent_said": {"type": "array", "items": {"type": "string"}},
        "outcome": {"anyOf": [{"type": "string", "enum": _OUTCOMES}, {"type": "null"}]},
        "services_mentioned": {"type": "array", "items": {"type": "string"}},
        "sentiment": {"type": "string", "enum": ["positive", "neutral", "negative"]},
        "appointment_scheduled": {"type": "boolean"},
        "appointment_date": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "notes": {"type": "string"},
    },
    "required": [
        "client_said", "agent_said", "outcome", "services_mentioned",
        "sentiment", "appointment_scheduled", "appointment_date", "notes",
    ],
    "additionalProperties": False,
}


def _extract_json(text: str) -> dict:
    """Parse the model's reply, tolerating ```json fences if a fallback call
    produced them (structured outputs never emits them, plain calls can)."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```")[1] if "```" in text[3:] else text[3:]
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    return json.loads(text.strip())


async def analyze_transcript(transcript: str, api_key: str = "", duration_seconds: int = 0) -> dict:
    if not transcript or not transcript.strip():
        return _empty_result()

    api_key = (api_key or "").strip()
    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()

    if not api_key:
        logger.error("No Anthropic API key available for transcript analysis")
        return _empty_result(error="Sin API key de Anthropic configurada")

    content = transcript
    if duration_seconds:
        content = f"[Duración de la llamada: {duration_seconds} segundos]\n\n{transcript}"

    client = AsyncAnthropic(api_key=api_key)
    messages = [{"role": "user", "content": content}]

    try:
        message = await client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=messages,
            output_config={"format": {"type": "json_schema", "schema": RESPONSE_SCHEMA}},
        )
        return _extract_json(message.content[0].text)
    except Exception as e:
        # Structured outputs is the preferred path, but never let an unsupported
        # schema/SDK/model combination cost us the analysis entirely — retry plain.
        logger.warning(f"Structured-output analysis failed ({type(e).__name__}: {e}); retrying without schema")

    try:
        message = await client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT + "\n\nResponde SOLO con el JSON válido, sin markdown ni backticks.",
            messages=messages,
        )
        return _extract_json(message.content[0].text)
    except Exception as e:
        logger.error(f"Error analyzing transcript: {e}", exc_info=True)
        return _empty_result(error=f"{type(e).__name__}: {e}")


def _empty_result(error: str = "") -> dict:
    return {
        "client_said": [],
        "agent_said": [],
        "outcome": None,
        "services_mentioned": [],
        "sentiment": "neutral",
        "appointment_scheduled": False,
        "appointment_date": None,
        "notes": "",
        "_error": error,
    }
