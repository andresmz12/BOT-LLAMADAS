import { useState, useEffect, useRef } from 'react'
import { CheckCircleIcon, EnvelopeIcon, PaperClipIcon, PaperAirplaneIcon, BoltIcon } from '@heroicons/react/24/outline'
import {
  getEmailSettings, saveEmailSettings, uploadEmailAttachment,
  sendTestEmail, bulkSendEmail, getCampaigns,
} from '../api/client'

// All available template keys (including standalone "general")
const TEMPLATES = [
  { key: 'general',            label: 'General / Campaña' },
  { key: 'interested',         label: 'Interesado' },
  { key: 'callback_requested', label: 'Solicita callback' },
  { key: 'voicemail',          label: 'Buzón de voz' },
  { key: 'not_interested',     label: 'No interesado' },
]

// Only post-call outcomes (for the automations section)
const CALL_OUTCOMES = TEMPLATES.filter(t => t.key !== 'general')
const OUTCOME_FLAGS = {
  interested: 'email_send_on_interested',
  callback_requested: 'email_send_on_callback',
  voicemail: 'email_send_on_voicemail',
  not_interested: 'email_send_on_not_interested',
}

const EMPTY_TMPL = { subject: '', color: '#4F46E5', greeting: '', body: '', cta_text: '', cta_url: '', signature: '' }
const VARS_HINT = '{{nombre}}  {{empresa}}  {{agente}}  {{telefono}}  {{fecha}}'

function buildHtml(tmpl) {
  const c = tmpl.color || '#4F46E5'
  const cta = tmpl.cta_text && tmpl.cta_url
    ? `<p style="text-align:center;margin:20px 0"><a href="${tmpl.cta_url}" style="background:${c};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${tmpl.cta_text}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:${c};padding:16px 22px"><p style="color:#fff;margin:0;font-size:15px;font-weight:600">Mensaje</p></div>
  <div style="padding:22px">
    <p style="margin:0 0 12px">${tmpl.greeting || '<span style="color:#9ca3af;font-style:italic">Saludo...</span>'}</p>
    <div style="white-space:pre-wrap;line-height:1.65">${tmpl.body || '<span style="color:#9ca3af;font-style:italic">Cuerpo del mensaje...</span>'}</div>
    ${cta}
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:18px 0">
    <p style="color:#9ca3af;font-size:12px;margin:0">${tmpl.signature || '<span style="font-style:italic">Firma...</span>'}</p>
  </div>
</div>`
}

function Toggle({ checked, onChange }) {
  return (
    <div onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer flex-shrink-0 ${checked ? 'bg-blue-500' : 'bg-slate-700'}`}>
      <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </div>
  )
}

function TemplateEditor({ tmplKey, tmpl, onChange }) {
  const set = (field, val) => onChange(field, val)
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">Variables: <span className="font-mono text-blue-400">{VARS_HINT}</span></p>

      <input type="text" value={tmpl.subject} onChange={e => set('subject', e.target.value)}
        placeholder="Asunto del email — ej: Hola {{nombre}}, tenemos algo para ti"
        className="z-input text-sm" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Saludo</label>
          <input type="text" value={tmpl.greeting} onChange={e => set('greeting', e.target.value)}
            placeholder="Estimado/a {{nombre}}," className="z-input text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Color de cabecera</label>
          <div className="flex gap-2 items-center">
            <input type="color" value={tmpl.color || '#4F46E5'} onChange={e => set('color', e.target.value)}
              className="w-9 h-9 rounded border border-z-border cursor-pointer bg-transparent flex-shrink-0" />
            <input type="text" value={tmpl.color || '#4F46E5'} onChange={e => set('color', e.target.value)}
              className="z-input text-sm font-mono flex-1" />
          </div>
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Cuerpo del mensaje</label>
        <textarea rows={4} value={tmpl.body} onChange={e => set('body', e.target.value)}
          placeholder="Escribe el contenido aquí..." className="z-input text-sm resize-none" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Botón — texto</label>
          <input type="text" value={tmpl.cta_text} onChange={e => set('cta_text', e.target.value)}
            placeholder="Ver oferta" className="z-input text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Botón — URL</label>
          <input type="url" value={tmpl.cta_url} onChange={e => set('cta_url', e.target.value)}
            placeholder="https://..." className="z-input text-sm" />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Firma</label>
        <input type="text" value={tmpl.signature} onChange={e => set('signature', e.target.value)}
          placeholder="El equipo de {{agente}}" className="z-input text-sm" />
      </div>

      <div>
        <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Vista previa</p>
        <div className="rounded-lg overflow-hidden bg-white text-sm"
          dangerouslySetInnerHTML={{ __html: buildHtml(tmpl) }} />
      </div>
    </div>
  )
}

export default function EmailMarketing() {
  // Main page tab
  const [pageTab, setPageTab] = useState('campaign')   // 'campaign' | 'auto' | 'templates' | 'settings'

  const [cfg, setCfg] = useState({
    email_enabled: false,
    email_from: '',
    email_from_name: '',
    sendgrid_configured: false,
    email_send_on_interested: true,
    email_send_on_callback: false,
    email_send_on_voicemail: false,
    email_send_on_not_interested: false,
    email_templates: {},
    email_attachment_name: null,
  })
  const [campaigns, setCampaigns] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Template editor active key
  const [activeTmplKey, setActiveTmplKey] = useState('general')

  // Bulk send
  const [bulkCampaignId, setBulkCampaignId] = useState('')
  const [bulkTmplKey, setBulkTmplKey] = useState('general')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Test email
  const [testEmail, setTestEmail] = useState('')
  const [testTmpl, setTestTmpl] = useState('general')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Attachment
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getEmailSettings().then(data => setCfg({
      email_enabled: data.email_enabled ?? false,
      email_from: data.email_from || '',
      email_from_name: data.email_from_name || '',
      sendgrid_configured: data.sendgrid_configured ?? false,
      email_send_on_interested: data.email_send_on_interested ?? true,
      email_send_on_callback: data.email_send_on_callback ?? false,
      email_send_on_voicemail: data.email_send_on_voicemail ?? false,
      email_send_on_not_interested: data.email_send_on_not_interested ?? false,
      email_templates: data.email_templates || {},
      email_attachment_name: data.email_attachment_name || null,
    })).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  const getTmpl = k => cfg.email_templates[k] || { ...EMPTY_TMPL }
  const setTmplField = (k, field, val) =>
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [k]: { ...getTmpl(k), [field]: val } } }))

  const handleSave = async () => {
    setSaving(true); setSaved(false)
    try {
      await saveEmailSettings({
        email_enabled: cfg.email_enabled,
        email_from: cfg.email_from || null,
        email_from_name: cfg.email_from_name || null,
        email_send_on_interested: cfg.email_send_on_interested,
        email_send_on_callback: cfg.email_send_on_callback,
        email_send_on_voicemail: cfg.email_send_on_voicemail,
        email_send_on_not_interested: cfg.email_send_on_not_interested,
        email_templates: cfg.email_templates,
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleBulkSend = async () => {
    if (!confirm(`¿Enviar emails a todos los prospectos con correo${bulkCampaignId ? ' de esta campaña' : ''}?`)) return
    setBulkLoading(true); setBulkResult(null)
    try {
      const res = await bulkSendEmail({ campaign_id: bulkCampaignId ? Number(bulkCampaignId) : null, template_key: bulkTmplKey })
      setBulkResult(res)
    } catch (err) {
      setBulkResult({ error: err.response?.data?.detail || 'Error al enviar' })
    } finally { setBulkLoading(false) }
  }

  const handleTest = async () => {
    if (!testEmail) return
    setTestLoading(true); setTestResult(null)
    try {
      await sendTestEmail({ to_email: testEmail, outcome: testTmpl })
      setTestResult({ ok: true })
    } catch (err) {
      setTestResult({ ok: false, msg: err.response?.data?.detail || 'Error al enviar' })
    } finally { setTestLoading(false) }
  }

  const handleAttach = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    if (file.size > 5 * 1024 * 1024) { setAttachMsg({ ok: false, text: 'Máximo 5 MB' }); return }
    setAttachUploading(true); setAttachMsg(null)
    try {
      const res = await uploadEmailAttachment(file)
      setCfg(p => ({ ...p, email_attachment_name: res.filename }))
      setAttachMsg({ ok: true, text: `Subido: ${res.filename}` })
    } catch (err) {
      setAttachMsg({ ok: false, text: err.response?.data?.detail || 'Error' })
    } finally { setAttachUploading(false) }
  }

  const PAGE_TABS = [
    { key: 'campaign', label: 'Envío masivo',   Icon: PaperAirplaneIcon },
    { key: 'auto',     label: 'Post-llamada',    Icon: BoltIcon },
    { key: 'templates',label: 'Plantillas',      Icon: EnvelopeIcon },
    { key: 'settings', label: 'Configuración',   Icon: null },
  ]

  return (
    <div className="p-6 space-y-5 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <EnvelopeIcon className="w-6 h-6 text-z-blue-light" /> Email Marketing
        </h1>
        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
          cfg.sendgrid_configured ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-500'
        }`}>
          {cfg.sendgrid_configured ? '✓ SendGrid activo' : '✗ SendGrid sin configurar'}
        </span>
      </div>

      {/* Page tabs */}
      <div className="flex gap-1 bg-black/30 rounded-lg p-1 border border-z-border">
        {PAGE_TABS.map(({ key, label }) => (
          <button key={key} onClick={() => setPageTab(key)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              pageTab === key ? 'bg-z-card text-slate-100 shadow' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ─── TAB: Envío masivo ─── */}
      {pageTab === 'campaign' && (
        <div className="space-y-4">
          <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-4">
            <p className="text-sm text-slate-400">
              Envía emails directamente a tus prospectos — sin necesidad de llamadas previas.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Campaña (opcional)</label>
                <select value={bulkCampaignId} onChange={e => setBulkCampaignId(e.target.value)} className="z-input text-sm">
                  <option value="">Todos los prospectos con email</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 mb-1 block">Plantilla a usar</label>
                <select value={bulkTmplKey} onChange={e => setBulkTmplKey(e.target.value)} className="z-input text-sm">
                  {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>

              {/* Preview of selected template */}
              {getTmpl(bulkTmplKey).subject && (
                <div className="bg-black/20 rounded-lg p-3 text-xs text-slate-400 space-y-1">
                  <p><span className="text-slate-500">Asunto:</span> {getTmpl(bulkTmplKey).subject}</p>
                  {getTmpl(bulkTmplKey).body && (
                    <p className="truncate"><span className="text-slate-500">Cuerpo:</span> {getTmpl(bulkTmplKey).body.slice(0, 80)}…</p>
                  )}
                </div>
              )}

              <button
                onClick={handleBulkSend}
                disabled={bulkLoading || !cfg.sendgrid_configured}
                className="z-btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <PaperAirplaneIcon className="w-4 h-4" />
                {bulkLoading ? 'Enviando...' : 'Enviar campaña de email'}
              </button>

              {!cfg.sendgrid_configured && (
                <p className="text-xs text-amber-400">SendGrid no está configurado — pide al administrador que lo active.</p>
              )}

              {bulkResult && (
                <div className={`rounded-lg p-3 text-sm ${bulkResult.error ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-green-500/10 border border-green-500/20 text-green-400'}`}>
                  {bulkResult.error
                    ? `✗ ${bulkResult.error}`
                    : `✓ ${bulkResult.sent} emails enviados${bulkResult.skipped ? ` · ${bulkResult.skipped} fallaron` : ''}`
                  }
                  {bulkResult.errors?.length > 0 && (
                    <ul className="mt-1 text-xs text-red-400 list-disc list-inside">
                      {bulkResult.errors.map((e, i) => <li key={i}>{e.email}: {e.error}</li>)}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Test send */}
          <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Enviar email de prueba</h3>
            <div className="flex gap-2">
              <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
                placeholder="tu@correo.com" className="z-input text-sm flex-1" />
              <select value={testTmpl} onChange={e => setTestTmpl(e.target.value)} className="z-input text-sm w-40">
                {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <button onClick={handleTest} disabled={testLoading || !testEmail}
                className="z-btn-primary text-sm disabled:opacity-50 whitespace-nowrap">
                {testLoading ? 'Enviando...' : 'Probar'}
              </button>
            </div>
            {testResult && (
              <p className={`text-xs ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
                {testResult.ok ? '✓ Prueba enviada correctamente' : `✗ ${testResult.msg}`}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB: Post-llamada ─── */}
      {pageTab === 'auto' && (
        <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-4">
          <p className="text-sm text-slate-400">
            Envía un email automáticamente cuando una llamada termina con un resultado específico.
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <Toggle checked={cfg.email_enabled} onChange={() => setCfg(p => ({ ...p, email_enabled: !p.email_enabled }))} />
            <span className="text-sm font-medium text-slate-200">Activar emails automáticos post-llamada</span>
          </label>

          <div className={`space-y-2 transition-opacity ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
            {CALL_OUTCOMES.map(o => {
              const flag = OUTCOME_FLAGS[o.key]
              return (
                <label key={o.key} className="flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-white/5 border border-z-border">
                  <Toggle checked={cfg[flag]} onChange={() => setCfg(p => ({ ...p, [flag]: !p[flag] }))} />
                  <div>
                    <p className="text-sm text-slate-200">{o.label}</p>
                    <p className="text-xs text-slate-500">
                      {cfg[flag] ? `Usa la plantilla "${o.label}"` : 'Desactivado'}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>

          <p className="text-xs text-slate-500">
            Edita las plantillas en la pestaña <strong className="text-slate-400">Plantillas</strong>.
          </p>
        </div>
      )}

      {/* ─── TAB: Plantillas ─── */}
      {pageTab === 'templates' && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          {/* Template selector tabs */}
          <div className="flex border-b border-z-border overflow-x-auto">
            {TEMPLATES.map(t => (
              <button key={t.key} onClick={() => setActiveTmplKey(t.key)}
                className={`flex-shrink-0 px-4 py-3 text-xs font-medium transition-colors ${
                  activeTmplKey === t.key ? 'text-slate-100 bg-black/20 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="p-5">
            <TemplateEditor
              tmplKey={activeTmplKey}
              tmpl={getTmpl(activeTmplKey)}
              onChange={(field, val) => setTmplField(activeTmplKey, field, val)}
            />
          </div>
        </div>
      )}

      {/* ─── TAB: Configuración ─── */}
      {pageTab === 'settings' && (
        <div className="space-y-4">
          <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Remitente</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Email</label>
                <input type="email" value={cfg.email_from}
                  onChange={e => setCfg(p => ({ ...p, email_from: e.target.value }))}
                  placeholder="info@empresa.com" className="z-input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Nombre</label>
                <input type="text" value={cfg.email_from_name}
                  onChange={e => setCfg(p => ({ ...p, email_from_name: e.target.value }))}
                  placeholder="Isabella - Mi Empresa" className="z-input text-sm" />
              </div>
            </div>
          </div>

          <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
              <PaperClipIcon className="w-3.5 h-3.5" /> Adjunto
            </h3>
            <p className="text-xs text-slate-500">PDF o imagen, máx. 5 MB — se adjunta a todos los emails enviados.</p>
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleAttach} />
              <button onClick={() => fileRef.current?.click()} disabled={attachUploading}
                className="z-btn-ghost border border-z-border text-sm disabled:opacity-50">
                {attachUploading ? 'Subiendo...' : cfg.email_attachment_name ? 'Reemplazar' : 'Subir adjunto'}
              </button>
              {cfg.email_attachment_name && (
                <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded truncate max-w-[180px]">
                  {cfg.email_attachment_name}
                </span>
              )}
            </div>
            {attachMsg && <p className={`text-xs ${attachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{attachMsg.text}</p>}
          </div>
        </div>
      )}

      {/* Save — always visible */}
      <div className="flex items-center gap-3 pb-2">
        <button onClick={handleSave} disabled={saving} className="z-btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
            <CheckCircleIcon className="w-4 h-4" /> Guardado
          </span>
        )}
      </div>
    </div>
  )
}
