import { useState, useRef } from 'react'
import { useTranslation } from 'react-i18next'
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

export default function Marketing() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('images')
  const [copyPrefill, setCopyPrefill] = useState(null)

  const TABS = [
    { key: 'images',   label: t('marketing.tabImages'),   Icon: PhotoIcon },
    { key: 'videos',   label: t('marketing.tabVideos'),   Icon: FilmIcon },
    { key: 'copy',     label: t('marketing.tabCopy'),     Icon: DocumentTextIcon },
    { key: 'calendar', label: t('marketing.tabCalendar'), Icon: CalendarDaysIcon },
  ]

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  if (user.role !== 'superadmin' && !user.marketing_enabled) {
    return (
      <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <div className="p-4 rounded-full bg-slate-800 border border-z-border">
          <SparklesIcon className="w-10 h-10 text-slate-500" />
        </div>
        <h2 className="text-xl font-bold text-slate-200">{t('marketing.notEnabledTitle')}</h2>
        <p className="text-slate-500 max-w-sm">
          {t('marketing.notEnabledHint')}
        </p>
      </div>
    )
  }

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
          <h1 className="text-2xl font-bold text-slate-100">{t('marketing.title')}</h1>
          <p className="text-sm text-slate-500">{t('marketing.subtitle')}</p>
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
  const { t } = useTranslation()
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
    if (f.size > 10 * 1024 * 1024) { setError(t('marketing.images.refTooBig')); return }
    setRefFile(f); setError(null)
  }

  const generate = async () => {
    if (!prompt.trim()) return
    setLoading(true); setError(null); setImages([])
    try {
      const r = await generateImage({ prompt, size, quality, n: quantity }, refFile)
      setImages(r.urls || [])
    } catch (e) {
      setError(e.response?.data?.detail || t('marketing.images.generateError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <PhotoIcon className="w-4 h-4 text-z-blue-light" />
          <h2 className="text-sm font-semibold text-slate-200">{t('marketing.images.title')}</h2>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">{t('marketing.images.descLabel')}</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t('marketing.images.descPlaceholder')}
            className="z-input-light text-sm resize-none"
          />
        </div>

        {/* Reference image upload */}
        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">{t('marketing.images.refLabel')} <span className="text-slate-600">{t('marketing.images.optional')}</span></label>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickRef} />
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-white/5 border border-z-border text-slate-300 hover:bg-white/10 hover:text-slate-100 transition-colors"
            >
              <PhotoIcon className="w-3.5 h-3.5" />
              {refFile ? refFile.name : t('marketing.images.uploadRef')}
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
                  {t('marketing.images.remove')}
                </button>
              </>
            )}
          </div>
          {refFile && (
            <p className="text-xs text-z-blue-light mt-1.5">
              {t('marketing.images.refHint')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.images.format')}</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="z-input-light text-sm">
              <option value="1024x1024">{t('marketing.images.square')}</option>
              <option value="1536x1024">{t('marketing.images.horizontal')}</option>
              <option value="1024x1536">{t('marketing.images.vertical')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.images.quality')}</label>
            <select value={quality} onChange={e => setQuality(e.target.value)} className="z-input-light text-sm">
              <option value="standard">{t('marketing.images.standard')}</option>
              <option value="hd">HD</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.images.quantity')}</label>
            <select value={quantity} onChange={e => setQty(Number(e.target.value))} className="z-input-light text-sm">
              <option value={1}>{t('marketing.images.qty1')}</option>
              <option value={2}>{t('marketing.images.qty2')}</option>
              <option value={4}>{t('marketing.images.qty4')}</option>
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
              {refFile ? t('marketing.images.analyzingAndGenerating') : t('marketing.images.generatingImage')}
            </>
          ) : (
            <>{t('marketing.images.generateImage')}</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {images.length > 0 && (
        <div className={`grid gap-4 ${images.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1 max-w-lg'}`}>
          {images.map((url, i) => (
            <div key={i} className="bg-z-card rounded-xl border border-z-border overflow-hidden">
              <img src={url} alt={t('marketing.images.generatedAlt', { n: i + 1 })} className="w-full object-cover" />
              <div className="px-4 py-3">
                <a
                  href={url}
                  download={`imagen-${i + 1}.png`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors w-fit"
                >
                  <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {t('marketing.images.download')}
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
  const { t } = useTranslation()
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
      setError(t('marketing.videos.refTooBig'))
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
        setError(t('marketing.videos.noVideoReturned'))
      }
    } catch (e) {
      setError(e.response?.data?.detail || t('marketing.videos.generateError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <FilmIcon className="w-4 h-4 text-purple-400" />
          <h2 className="text-sm font-semibold text-slate-200">{t('marketing.videos.title')}</h2>
        </div>

        <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 text-xs text-amber-300">
          {t('marketing.videos.durationWarning')}
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block">{t('marketing.videos.descLabel')}</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder={t('marketing.videos.descPlaceholder')}
            className="z-input-light text-sm resize-none"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.videos.duration')}</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="z-input-light text-sm">
              <option value={5}>{t('marketing.videos.5sec')}</option>
              <option value={10}>{t('marketing.videos.8sec')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.videos.style')}</label>
            <select value={style} onChange={e => setStyle(e.target.value)} className="z-input-light text-sm">
              {['Cinematográfico', 'Publicitario', 'Minimalista', 'Documental'].map(s =>
                <option key={s} value={s}>{t(`marketing.videos.styles.${s}`)}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.videos.baseImage')} <span className="text-slate-600">{t('marketing.videos.optional')}</span></label>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="z-input-light text-sm text-left w-full truncate text-slate-400 hover:text-slate-200"
            >
              {imageFile ? imageFile.name : t('marketing.videos.uploadImage')}
            </button>
            <p className="text-xs text-slate-600 mt-1">{t('marketing.videos.baseImageHint')}</p>
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
              {t('marketing.videos.generatingVideo')}
            </>
          ) : (
            <>{t('marketing.videos.generateVideo')}</>
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
              <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {t('marketing.videos.downloadMp4')}
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
  const { t } = useTranslation()
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
      setError(e.response?.data?.detail || t('marketing.copy.generateError'))
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
          <h2 className="text-sm font-semibold text-slate-200">{t('marketing.copy.title')}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.copy.contentType')}</label>
            <select value={contentType} onChange={e => setContentType(e.target.value)} className="z-input-light text-sm">
              {CONTENT_TYPES.map(ct => <option key={ct} value={ct}>{t(`marketing.copy.contentTypes.${ct}`)}</option>)}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.copy.businessLabel')}</label>
            <input
              type="text"
              value={business}
              onChange={e => setBusiness(e.target.value)}
              placeholder={t('marketing.copy.businessPlaceholder')}
              className="z-input-light text-sm"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.copy.objectiveLabel')}</label>
            <input
              type="text"
              value={objective}
              onChange={e => setObjective(e.target.value)}
              placeholder={t('marketing.copy.objectivePlaceholder')}
              className="z-input-light text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.copy.tone')}</label>
            <select value={tone} onChange={e => setTone(e.target.value)} className="z-input-light text-sm">
              {['Profesional', 'Amigable', 'Urgente', 'Inspirador', 'Divertido'].map(tn =>
                <option key={tn} value={tn}>{t(`marketing.copy.tones.${tn}`)}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.copy.language')}</label>
            <select value={language} onChange={e => setLanguage(e.target.value)} className="z-input-light text-sm">
              {['Español', 'Inglés', 'Spanglish'].map(lg =>
                <option key={lg} value={lg}>{t(`marketing.copy.languages.${lg}`)}</option>)}
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
              {t('marketing.copy.generatingCopy')}
            </>
          ) : (
            <>{t('marketing.copy.generateCopy')}</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {result && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          <div className="px-5 py-3 border-b border-z-border flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-200">{t('marketing.copy.result')}</h3>
            <div className="flex gap-2">
              <button
                onClick={generate}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors disabled:opacity-40"
              >
                <ArrowPathIcon className="w-3.5 h-3.5" /> {t('marketing.copy.regenerate')}
              </button>
              <button
                onClick={copy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 hover:text-slate-200 transition-colors"
              >
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                {copied ? t('marketing.copy.copied') : t('marketing.copy.copy')}
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
  const { t } = useTranslation()
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
      setError(e.response?.data?.detail || t('marketing.calendar.generateError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <CalendarDaysIcon className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-semibold text-slate-200">{t('marketing.calendar.title')}</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.calendar.businessTypeLabel')}</label>
            <input
              type="text"
              value={businessType}
              onChange={e => setBusiness(e.target.value)}
              placeholder={t('marketing.calendar.businessTypePlaceholder')}
              className="z-input-light text-sm"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.calendar.frequency')}</label>
            <select value={frequency} onChange={e => setFrequency(e.target.value)} className="z-input-light text-sm">
              <option>3 veces/semana</option>
              <option>5 veces/semana</option>
              <option>Diario</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">{t('marketing.calendar.period')}</label>
            <select value={period} onChange={e => setPeriod(e.target.value)} className="z-input-light text-sm">
              <option>1 semana</option>
              <option>2 semanas</option>
              <option>1 mes</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-xs text-slate-400 mb-2 block">{t('marketing.calendar.platforms')}</label>
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
              {t('marketing.calendar.generatingCalendar')}
            </>
          ) : (
            <>{t('marketing.calendar.generateCalendar')}</>
          )}
        </button>

        {error && <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}
      </div>

      {posts.length > 0 && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          <div className="px-5 py-3 border-b border-z-border">
            <p className="text-sm font-semibold text-slate-200">{t('marketing.calendar.plannedPosts', { count: posts.length })}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-z-border">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{t('marketing.calendar.headers.day')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{t('marketing.calendar.headers.platform')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{t('marketing.calendar.headers.type')}</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-slate-500 uppercase tracking-wide">{t('marketing.calendar.headers.topic')}</th>
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
                        {t('marketing.calendar.generateCopyBtn')}
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
