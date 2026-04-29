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

1. "appointment_scheduled" — el prospecto aceptó una cita o reunión con fecha/hora concreta.

2. "interested" — SOLO si quien contestó muestra interés ACTIVO en el producto/servicio del agente.
   Requiere al menos uno de estos:
   - Preguntó activamente por precios, costos o detalles del servicio que ofrece el agente.
   - Dijo explícitamente: "cuéntame más", "me interesa", "suena bien", "¿cómo funciona?", "¿qué incluye?", "¿cuánto cuesta?".
   - Aceptó recibir más información, una demostración o una llamada de seguimiento.
   - Pidió los datos de contacto del agente para saber más.
   IMPORTANTE — NO cuenta como interés:
   - Responder preguntas del agente sobre el propio negocio del cliente.
   - Describir los servicios que el cliente ya ofrece en su empresa.
   - Mantener una conversación cortés sin pedir nada sobre el producto del agente.

3. "callback_requested" — cualquiera de estas situaciones:
   - La persona buscada NO estaba disponible: alguien contestó y dijo "no está", "no se encuentra",
     "está ocupado", "no está en este momento", "ahorita no puede", "está en una junta",
     "no está disponible ahora", "no está aquí".
   - El prospecto dijo: "Llámeme después", "Estoy ocupado", "Mañana", "Ahorita no puedo",
     "En otro momento", "Más tarde", "Llama mañana", "Ahora no es buen momento", "Te llamo yo".

4. "not_interested" — si cualquiera de estas condiciones:
   - Dijo explícitamente "no me interesa", "no gracias", "no quiero", "no, gracias".
   - Dijo que ya tiene el servicio/producto: "ya tengo", "ya cuento con", "ya tenemos",
     "ya tengo otro proveedor", "ya tenemos uno", "ya tenemos contratado", "ya lo tenemos",
     "ya estamos con alguien", "ya trabajamos con otro".
   - Dijo "no lo necesito", "no aplica", "no es para nosotros", "no estamos interesados",
     "no nos interesa", "no es algo que necesitemos".
   - Colgó inmediatamente después de escuchar la presentación sin mostrar ningún interés.

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
Responde SOLO con el JSON válido, sin texto adicional, sin markdown, sin backticks."""


async def analyze_transcript(transcript: str, api_key: str = "", duration_seconds: int = 0) -> dict:
    if not transcript or not transcript.strip():
        return _empty_result()

    if not api_key:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not api_key:
        logger.warning("No Anthropic API key available for transcript analysis")
        return _empty_result()

    content = transcript
    if duration_seconds:
        content = f"[Duración de la llamada: {duration_seconds} segundos]\n\n{transcript}"

    client = AsyncAnthropic(api_key=api_key)
    try:
        message = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": content}],
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
