import { useState, useRef } from 'react'
import {
  SparklesIcon,
  PhotoIcon,
  FilmIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  ArrowDownTrayIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'
import { generateImage, generateVideo, generateCopy, generateCalendar } from '../api/client'

const TABS = [
  { key: 'images',   label: 'Imágenes IA',           Icon: PhotoIcon },
  { key: 'videos',   label: 'Videos IA',              Icon: FilmIcon },
  { key: 'copy',     label: 'Copy & Textos',           Icon: DocumentTextIcon },
  { key: 'calendar', label: 'Calendario',              Icon: CalendarDaysIcon },
]

export default function Marketing() {
  const [activeTab, setActiveTab] = useState('images')
  const [copyPrefill, setCopyPrefill] = useState(null)

  const goToCopy = (prefill) => {
    setCopyPrefill(prefill)
    setActiveTab('copy')
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-z-blue/15">
          <SparklesIcon className="w-6 h-6 text-z-blue-light" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Marketing IA</h1>
          <p className="text-sm text-slate-500">Genera imágenes, videos, textos y calendarios con inteligencia artificial</p>
        </div>
      </div>

      <div className="flex gap-1 bg-z-card border border-z-border rounded-xl p-1">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 flex-1 justify-center px-2 sm:px-3 py-2.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-z-blue text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'images'   && <ImagesTab />}
      {activeTab === 'videos'   && <VideosTab />}
      {activeTab === 'copy'     && <CopyTab prefill={copyPrefill} onPrefillUsed={() => setCopyPrefill(null)} />}
      {activeTab === 'calendar' && <CalendarTab onGenerateCopy={goToCopy} />}
    </div>
  )
}


// ── Tab 1: Imágenes IA ────────────────────────────────────────────────────────

function ImagesTab() {
  const [prompt, setPrompt]   = useState('')
  const [size, setSize]       = useState('1024x1024')
  const [quality, setQuality] = useState('standard')
  const [quantity, setQty]    = useState(1)
  const [refFile, setRefFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [images, setImages]   = useState([])
  const [error, setError]     = useState(null)
  const fileRef = useRef(null)

  const pickRef = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) { setError('La imagen de referencia no puede superar 10 MB.'); return }
    setRefFile(f); setError(null)
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setImages([])
    try {
      const r = await generateImage({ prompt, size, quality, n: quantity }, refFile)
      setImages(r.urls || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al generar la imagen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <PhotoIcon className="w-4 h-4 text-z-blue-light" />
          <h2 className="text-sm font-semibold text-slate-200">Generador de imágenes con DALL-E 3</h2>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Descripción de la imagen *</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="ej: logo minimalista para una tienda de envíos, fondo blanco, colores azul y dorado, estilo moderno y profesional"
            className="z-input-light text-sm resize-none"
          />
        </div>

        {/* Reference image upload */}
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Imagen de referencia <span className="text-slate-600">(opcional)</span></label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickRef} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/5 border border-z-border text-slate-300 hover:bg-white/10 hover:text-slate-100 transition-colors"
            >
              <PhotoIcon className="w-3.5 h-3.5" />
              {refFile ? refFile.name : 'Subir imagen de referencia'}
            </button>
            {refFile && (
              <>
                <img
                  src={URL.createObjectURL(refFile)}
                  alt="referencia"
                  className="w-12 h-12 object-cover rounded-lg border border-z-border flex-shrink-0"
                />
                <button
                  onClick={() => { setRefFile(null); fileRef.current && (fileRef.current.value = '') }}
                  className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                >
                  ✕ Quitar
                </button>
              </>
            )}
          </div>
          {refFile && (
            <p className="text-xs text-z-blue-light mt-1.5">
              ✓ GPT-4o analizará tu imagen y guiará a DALL-E 3 para generar algo similar
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Formato</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="z-input-light text-sm">
              <option value="1024x1024">Cuadrado (1:1)</option>
              <option value="1792x1024">Horizontal (16:9)</option>
              <option value="1024x1792">Vertical (9:16)</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Calidad</label>
            <select value={quality} onChange={e => setQuality(e.target.value)} className="z-input-light text-sm">
              <option value="standard">Estándar</option>
              <option value="hd">HD</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Cantidad</label>
            <select value={quantity} onChange={e => setQty(Number(e.target.value))} className="z-input-light text-sm">
              <option value={1}>1 imagen</option>
              <option value={2}>2 imágenes</option>
              <option value={4}>4 imágenes</option>
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="z-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              {refFile ? 'Analizando imagen y generando...' : 'Generando con DALL-E 3...'}
            </>
          ) : (
            <>✨ Generar imagen</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {images.length > 0 && (
        <div className={`grid gap-4 ${images.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-lg'}`}>
          {images.map((url, i) => (
            <div key={i} className="bg-z-card rounded-xl border border-z-border overflow-hidden">
              <img src={url} alt={`Generada ${i + 1}`} className="w-full object-cover" />
              <div className="px-4 py-3">
                <a
                  href={url}
                  download
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors w-fit"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Descargar
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Tab 2: Videos IA ──────────────────────────────────────────────────────────

function VideosTab() {
  const [prompt, setPrompt]     = useState('')
  const [duration, setDuration] = useState(5)
  const [style, setStyle]       = useState('Cinematográfico')
  const [imageFile, setImageFile] = useState(null)
  const [loading, setLoading]   = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [error, setError]       = useState(null)
  const fileRef = useRef(null)

  const pickFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (f.size > 10 * 1024 * 1024) {
      setError('La imagen no puede superar 10 MB.')
      return
    }
    setImageFile(f)
    setError(null)
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setVideoUrl(null)
    try {
      const fd = new FormData()
      fd.append('prompt_text', prompt)
      fd.append('duration', duration)
      fd.append('style', style)
      if (imageFile) fd.append('image', imageFile)

      const r = await generateVideo(fd)

      if (r.video_url) {
        setVideoUrl(r.video_url)
      } else if (r.video_b64) {
        const bytes = atob(r.video_b64)
        const arr = new Uint8Array(bytes.length)
        for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
        const blob = new Blob([arr], { type: 'video/mp4' })
        setVideoUrl(URL.createObjectURL(blob))
      } else {
        setError('El servidor no devolvió el video.')
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al generar el video.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FilmIcon className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-slate-200">Generador de videos con Google Veo 3</h2>
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-300">
          La generación tarda entre 1 y 12 minutos. No cierres esta pestaña mientras espera.
          Requiere una cuenta Google Cloud con acceso a Veo 3.
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">Descripción del video *</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="ej: producto de belleza girando sobre fondo negro, iluminación profesional, efecto bokeh, 5 segundos"
            className="z-input-light text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Duración</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="z-input-light text-sm">
              <option value={5}>5 segundos</option>
              <option value={10}>8 segundos</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Estilo</label>
            <select value={style} onChange={e => setStyle(e.target.value)} className="z-input-light text-sm">
              <option>Cinematográfico</option>
              <option>Publicitario</option>
              <option>Minimalista</option>
              <option>Documental</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Imagen base <span className="text-slate-600">(opcional)</span></label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="z-input-light text-sm text-left w-full truncate text-slate-400 hover:text-slate-200"
            >
              {imageFile ? imageFile.name : 'Subir imagen...'}
            </button>
            <p className="text-xs text-slate-600 mt-1">Sube una foto para animarla (imagen→video)</p>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !prompt.trim()}
          className="z-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generando video con Veo 3...
            </>
          ) : (
            <>🎬 Generar video</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {videoUrl && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          <video src={videoUrl} controls className="w-full" />
          <div className="px-4 py-3">
            <a
              href={videoUrl}
              download="video-generado.mp4"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors w-fit"
            >
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Descargar MP4
            </a>
          </div>
        </div>
      )}
    </div>
  )
}


// ── Tab 3: Copy & Textos ──────────────────────────────────────────────────────

const CONTENT_TYPES = [
  'Post Instagram',
  'Post Facebook',
  'Guión TikTok/Reels 30s',
  'Guión TikTok/Reels 60s',
  'Email de ventas',
  'SMS de seguimiento',
  'Script de llamada',
  'Bio de negocio',
  'Slogan / Tagline',
]

function CopyTab({ prefill, onPrefillUsed }) {
  const [contentType, setContentType] = useState('Post Instagram')
  const [business, setBusiness]       = useState(prefill?.business || '')
  const [objective, setObjective]     = useState(prefill?.objective || '')
  const [tone, setTone]               = useState('Profesional')
  const [language, setLanguage]       = useState('Español')
  const [loading, setLoading]         = useState(false)
  const [result, setResult]           = useState('')
  const [error, setError]             = useState(null)
  const [copied, setCopied]           = useState(false)

  const generate = async () => {
    if (!business.trim()) return
    if (prefill && onPrefillUsed) onPrefillUsed()
    setLoading(true); setError(null); setResult('')
    try {
      const r = await generateCopy({ content_type: contentType, business, objective, tone, language })
      setResult(r.text || '')
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al generar el copy.')
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const download = () => {
    const blob = new Blob([result], { type: 'text/plain' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `copy-${contentType.toLowerCase().replace(/\s+/g, '-')}.txt`
    a.click()
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <DocumentTextIcon className="w-4 h-4 text-green-400" />
          <h2 className="text-sm font-semibold text-slate-200">Generador de copy con Claude</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Tipo de contenido</label>
            <select value={contentType} onChange={e => setContentType(e.target.value)} className="z-input-light text-sm">
              {CONTENT_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">¿De qué trata tu negocio? *</label>
            <input
              type="text"
              value={business}
              onChange={e => setBusiness(e.target.value)}
              placeholder="ej: tienda de envíos de dinero a México, Chicago IL"
              className="z-input-light text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Objetivo del contenido</label>
            <input
              type="text"
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder="ej: conseguir nuevos clientes, promoción de verano"
              className="z-input-light text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Tono</label>
            <select value={tone} onChange={e => setTone(e.target.value)} className="z-input-light text-sm">
              <option>Profesional</option>
              <option>Amigable</option>
              <option>Urgente</option>
              <option>Inspirador</option>
              <option>Divertido</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Idioma</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="z-input-light text-sm">
              <option>Español</option>
              <option>Inglés</option>
              <option>Spanglish</option>
            </select>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !business.trim()}
          className="z-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generando copy...
            </>
          ) : (
            <>✍️ Generar copy</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {result && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          <div className="px-5 py-3 border-b border-z-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-200">Resultado</h3>
            <div className="flex gap-2">
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors disabled:opacity-40"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> Regenerar
              </button>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors"
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                {copied ? 'Copiado ✓' : 'Copiar'}
              </button>
              <button
                onClick={download}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors"
              >
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> .TXT
              </button>
            </div>
          </div>
          <div className="p-5">
            <textarea
              rows={14}
              value={result}
              onChange={e => setResult(e.target.value)}
              className="z-input-light text-sm resize-y font-mono leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  )
}


// ── Tab 4: Calendario de Contenido ───────────────────────────────────────────

const PLATFORM_OPTIONS = ['Instagram', 'Facebook', 'TikTok', 'LinkedIn', 'Twitter/X', 'YouTube']

const TYPE_BADGE = {
  imagen:   'bg-blue-500/15 text-blue-400',
  video:    'bg-purple-500/15 text-purple-400',
  carrusel: 'bg-cyan-500/15 text-cyan-400',
  reel:     'bg-pink-500/15 text-pink-400',
  historia: 'bg-amber-500/15 text-amber-400',
  texto:    'bg-slate-500/15 text-slate-400',
}

function CalendarTab({ onGenerateCopy }) {
  const [businessType, setBusiness] = useState('')
  const [platforms, setPlatforms]   = useState(['Instagram', 'Facebook'])
  const [frequency, setFrequency]   = useState('3 veces/semana')
  const [period, setPeriod]         = useState('1 semana')
  const [loading, setLoading]       = useState(false)
  const [posts, setPosts]           = useState([])
  const [error, setError]           = useState(null)

  const togglePlatform = (p) =>
    setPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])

  const generate = async () => {
    if (!businessType.trim() || !platforms.length) return
    setLoading(true); setError(null); setPosts([])
    try {
      const r = await generateCalendar({ business_type: businessType, platforms, frequency, period })
      setPosts(r.posts || [])
    } catch (e) {
      setError(e.response?.data?.detail || 'Error al generar el calendario.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDaysIcon className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">Generador de calendario con Claude</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">Tipo de negocio *</label>
            <input
              type="text"
              value={businessType}
              onChange={e => setBusiness(e.target.value)}
              placeholder="ej: tienda de ropa deportiva, restaurante mexicano, consultoría financiera"
              className="z-input-light text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Frecuencia</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)} className="z-input-light text-sm">
              <option>3 veces/semana</option>
              <option>5 veces/semana</option>
              <option>Diario</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Período</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="z-input-light text-sm">
              <option>1 semana</option>
              <option>2 semanas</option>
              <option>1 mes</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-2 block">Plataformas *</label>
            <div className="flex flex-wrap gap-2">
              {PLATFORM_OPTIONS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                    platforms.includes(p)
                      ? 'bg-z-blue/20 border-z-blue text-z-blue-light'
                      : 'border-z-border text-slate-500 hover:border-slate-500 hover:text-slate-300'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={generate}
          disabled={loading || !businessType.trim() || !platforms.length}
          className="z-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Generando calendario...
            </>
          ) : (
            <>📅 Generar calendario</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {posts.length > 0 && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          <div className="px-5 py-3 border-b border-z-border">
            <p className="text-sm font-semibold text-slate-200">{posts.length} publicaciones planificadas</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-z-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Día</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Plataforma</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Tema</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {posts.map((post, i) => (
                  <tr key={i} className="hover:bg-white/3 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{post.date}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-300 whitespace-nowrap">{post.platform}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[post.type] || 'bg-slate-500/15 text-slate-400'}`}>
                        {post.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-xs">
                      <p className="font-medium truncate">{post.topic}</p>
                      {post.caption_hint && <p className="text-slate-500 truncate mt-0.5">{post.caption_hint}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onGenerateCopy({ business: businessType, objective: post.topic })}
                        className="text-xs text-z-blue-light hover:text-blue-300 transition-colors whitespace-nowrap"
                      >
                        ✍️ Generar copy
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
