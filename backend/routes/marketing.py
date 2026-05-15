import os
import json
import base64
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional
from sqlmodel import Session
from database import get_session
from models import User, Organization
from routes.auth import get_current_user

router = APIRouter(prefix="/marketing", tags=["marketing"])
logger = logging.getLogger(__name__)


def _load_org(user: User, session: Session) -> Optional[Organization]:
    return session.get(Organization, user.organization_id) if user.organization_id else None


def _get_openai_key(org: Optional[Organization]) -> str:
    return ((org.openai_api_key if org else "") or "").strip() or os.getenv("OPENAI_API_KEY", "").strip()


def _get_google_key(org: Optional[Organization]) -> str:
    return ((org.google_api_key if org else "") or "").strip() or os.getenv("GOOGLE_API_KEY", "").strip()


def _get_anthropic_key(org: Optional[Organization]) -> str:
    return ((org.anthropic_api_key if org else "") or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()


# ── 1. Imágenes IA — DALL-E 3 ────────────────────────────────────────────────

@router.post("/generate-image")
async def generate_image(
    prompt: str = Form(...),
    size: str = Form("1024x1024"),
    quality: str = Form("standard"),
    n: int = Form(1),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = _load_org(current_user, session)
    api_key = _get_openai_key(org)
    if not api_key:
        raise HTTPException(status_code=503, detail="OpenAI API key no configurada. Configura OPENAI_API_KEY en Railway o en Configuración.")

    from openai import AsyncOpenAI
    client = AsyncOpenAI(api_key=api_key)
    n = max(1, min(int(n), 4))

    # Map legacy dall-e-3 params → gpt-image-1
    quality_map = {"standard": "medium", "hd": "high", "medium": "medium", "high": "high", "low": "low", "auto": "auto"}
    gpt_quality = quality_map.get(quality, "medium")
    size_map = {"1792x1024": "1536x1024", "1024x1792": "1024x1536"}
    gpt_size = size_map.get(size, size)  # 1024x1024 passes through unchanged

    final_prompt = prompt.strip()[:4000]

    # If a reference image is provided, use GPT-4o Vision to build a prompt from it
    if image and image.filename:
        image_bytes = await image.read()
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="La imagen de referencia supera el límite de 10 MB.")
        b64 = base64.b64encode(image_bytes).decode()
        mime = image.content_type or "image/jpeg"
        try:
            vision = await client.chat.completions.create(
                model="gpt-4o",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                        {"type": "text", "text": (
                            f"Analyze this reference image in detail. "
                            f"The user wants to create something similar with this request: {prompt}. "
                            "Write a single concise image generation prompt in English that captures the visual "
                            "style, composition, colors and key elements of the reference image while "
                            "incorporating the user request. Output only the prompt, no explanations."
                        )},
                    ],
                }],
                max_tokens=400,
            )
            final_prompt = vision.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"GPT-4o vision failed, using original prompt: {e}")

    # gpt-image-1 supports n>1 in a single call and returns b64_json
    try:
        resp = await client.images.generate(
            model="gpt-image-1",
            prompt=final_prompt,
            n=n,
            size=gpt_size,
            quality=gpt_quality,
        )
        urls = [f"data:image/png;base64,{img.b64_json}" for img in resp.data]
        return {"urls": urls}
    except Exception as e:
        err = str(e)
        if "content_policy" in err.lower() or "safety" in err.lower():
            raise HTTPException(status_code=400, detail="El prompt fue rechazado por la política de contenido de OpenAI.")
        if "401" in err or "invalid_api_key" in err.lower():
            raise HTTPException(status_code=401, detail="OpenAI API key inválida.")
        raise HTTPException(status_code=502, detail=f"Error OpenAI: {err[:300]}")


# ── 2. Videos IA — Google Veo 3 ──────────────────────────────────────────────

@router.post("/generate-video")
async def generate_video(
    prompt_text: str = Form(...),
    duration: int = Form(5),
    style: str = Form("Cinematográfico"),
    image: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = _load_org(current_user, session)
    api_key = _get_google_key(org)
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="Google API key no configurada. Configura GOOGLE_API_KEY en Railway o en Configuración para usar Veo 3.",
        )

    image_bytes: Optional[bytes] = None
    if image:
        image_bytes = await image.read()
        if len(image_bytes) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="La imagen supera el límite de 10 MB.")

    full_prompt = f"Estilo {style}. {prompt_text}"[:1000]
    valid_duration = 5 if int(duration) < 7 else 8

    def _run_veo() -> dict:
        try:
            from google import genai
            from google.genai import types
        except ImportError:
            raise RuntimeError("Paquete google-genai no instalado. Ejecuta: pip install google-genai")

        client = genai.Client(api_key=api_key)

        config = types.GenerateVideosConfig(
            duration_seconds=valid_duration,
            number_of_videos=1,
        )

        try:
            if image_bytes:
                img_obj = types.Image(image_bytes=image_bytes)
                operation = client.models.generate_videos(
                    model="veo-3.0-generate-preview",
                    prompt=full_prompt,
                    image=img_obj,
                    config=config,
                )
            else:
                operation = client.models.generate_videos(
                    model="veo-3.0-generate-preview",
                    prompt=full_prompt,
                    config=config,
                )
        except Exception as e:
            err = str(e)
            if "403" in err or "permission" in err.lower() or "access" in err.lower():
                raise RuntimeError(
                    "Acceso denegado a Veo 3. Verifica que tu cuenta de Google Cloud tenga el modelo 'veo-3.0-generate-preview' habilitado."
                )
            raise RuntimeError(f"Error al enviar solicitud a Veo 3: {err[:200]}")

        import time
        for _ in range(72):  # max 12 minutes
            time.sleep(10)
            operation = client.operations.get(operation)
            if operation.done:
                break

        if not operation.done:
            raise RuntimeError("Timeout: Veo 3 no completó la generación en el tiempo esperado (12 min).")

        if hasattr(operation, "error") and operation.error:
            raise RuntimeError(f"Veo 3 retornó error: {operation.error}")

        videos = operation.result.generated_videos if operation.result else []
        if not videos:
            raise RuntimeError("Veo 3 no generó ningún video.")

        video = videos[0]
        vid_obj = video.video

        if hasattr(vid_obj, "uri") and vid_obj.uri:
            return {"video_url": vid_obj.uri}
        elif hasattr(vid_obj, "video_bytes") and vid_obj.video_bytes:
            b64 = base64.b64encode(vid_obj.video_bytes).decode()
            return {"video_b64": b64}
        else:
            raise RuntimeError("Veo 3 no devolvió datos del video.")

    try:
        result = await asyncio.to_thread(_run_veo)
        return result
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error inesperado: {str(e)[:300]}")


# ── 3. Copy & Textos — Claude ─────────────────────────────────────────────────

CONTENT_TYPE_INSTRUCTIONS = {
    "Post Instagram": "un post para Instagram con emojis, máximo 2200 caracteres, llamativo y visual",
    "Post Facebook": "un post para Facebook con contexto más amplio, puede ser más largo y con link",
    "Guión TikTok/Reels 30s": "un guión de 30 segundos para TikTok/Reels: gancho (0-3s), contenido (4-25s), CTA (26-30s)",
    "Guión TikTok/Reels 60s": "un guión de 60 segundos para TikTok/Reels con estructura narrativa completa",
    "Email de ventas": "un email de ventas profesional con asunto, saludo, propuesta de valor, prueba social y CTA claro",
    "SMS de seguimiento": "un SMS corto (max 160 caracteres) de seguimiento comercial, directo y con CTA",
    "Script de llamada": "un script de llamada telefónica con presentación, gancho de apertura, preguntas de calificación y cierre",
    "Bio de negocio": "una bio completa para redes sociales: quiénes somos, qué hacemos, para quién, CTA",
    "Slogan / Tagline": "5 opciones de slogan/tagline cortas y memorables para el negocio",
}


class CopyRequest(BaseModel):
    content_type: str
    business: str
    objective: str
    tone: str = "Profesional"
    language: str = "Español"


@router.post("/generate-copy")
async def generate_copy(
    data: CopyRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = _load_org(current_user, session)
    api_key = _get_anthropic_key(org)
    if not api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada.")

    instructions = CONTENT_TYPE_INSTRUCTIONS.get(data.content_type, f"contenido de tipo '{data.content_type}'")
    lang_hint = {
        "Español": "Escribe en español.",
        "Inglés": "Write in English.",
        "Spanglish": "Mix Spanish and English naturally, as spoken by US Latinos.",
    }.get(data.language, "Escribe en español.")

    prompt = (
        f"Eres un experto en marketing y copywriting para negocios hispanos en Estados Unidos.\n"
        f"{lang_hint}\n\n"
        f"Genera {instructions}.\n\n"
        f"Negocio: {data.business}\n"
        f"Objetivo: {data.objective}\n"
        f"Tono: {data.tone}\n\n"
        f"Genera el contenido directamente, sin explicaciones previas."
    )

    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        return {"text": msg.content[0].text.strip()}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error Claude: {str(e)[:200]}")


# ── 4. Calendario de Contenido — Claude ──────────────────────────────────────

class CalendarRequest(BaseModel):
    business_type: str
    platforms: list[str]
    frequency: str = "3 veces/semana"
    period: str = "1 semana"


@router.post("/generate-calendar")
async def generate_calendar(
    data: CalendarRequest,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    org = _load_org(current_user, session)
    api_key = _get_anthropic_key(org)
    if not api_key:
        raise HTTPException(status_code=503, detail="Anthropic API key no configurada.")

    platforms_str = ", ".join(data.platforms[:5]) or "Instagram"

    prompt = (
        f"Eres un estratega de contenido digital experto en marketing para negocios hispanos.\n\n"
        f"Crea un calendario de contenido para: {data.period}\n"
        f"Negocio: {data.business_type}\n"
        f"Plataformas: {platforms_str}\n"
        f"Frecuencia: {data.frequency}\n\n"
        f"Responde ÚNICAMENTE con un JSON válido (sin markdown, sin texto adicional) con esta estructura exacta:\n"
        '{"posts": [{"date": "Lunes Semana 1", "platform": "Instagram", "type": "imagen", '
        '"topic": "Tema del post", "caption_hint": "Idea breve del contenido"}]}\n\n'
        'Los valores de "type" deben ser uno de: imagen, video, carrusel, reel, historia, texto\n'
        f"Genera todos los posts para {data.period} con frecuencia {data.frequency}."
    )

    try:
        from anthropic import AsyncAnthropic
        client = AsyncAnthropic(api_key=api_key)
        msg = await client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = msg.content[0].text.strip()
        if raw.startswith("```"):
            parts = raw.split("```")
            raw = parts[1] if len(parts) > 1 else raw
            if raw.startswith("json"):
                raw = raw[4:]
        data_json = json.loads(raw.strip())
        return data_json
    except json.JSONDecodeError:
        raise HTTPException(status_code=502, detail="Claude no devolvió JSON válido. Intenta de nuevo.")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Error Claude: {str(e)[:200]}")
