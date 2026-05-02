import { useState, useEffect, useRef } from 'react'
import { CheckCircleIcon, EnvelopeIcon, PaperClipIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { getEmailSettings, saveEmailSettings, uploadEmailAttachment, sendTestEmail } from '../api/client'

const OUTCOMES = [
  { key: 'interested',         label: 'Interesado',       flag: 'email_send_on_interested' },
  { key: 'callback_requested', label: 'Callback',         flag: 'email_send_on_callback' },
  { key: 'voicemail',          label: 'Buzón de voz',     flag: 'email_send_on_voicemail' },
  { key: 'not_interested',     label: 'No interesado',    flag: 'email_send_on_not_interested' },
]

const EMPTY_TMPL = { subject: '', color: '#4F46E5', greeting: '', body: '', cta_text: '', cta_url: '', signature: '' }

function buildHtml(tmpl) {
  const c = tmpl.color || '#4F46E5'
  const cta = tmpl.cta_text && tmpl.cta_url
    ? `<p style="text-align:center;margin:20px 0"><a href="${tmpl.cta_url}" style="background:${c};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${tmpl.cta_text}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:${c};padding:16px 22px"><p style="color:#fff;margin:0;font-size:15px;font-weight:600">Mensaje de seguimiento</p></div>
  <div style="padding:22px">
    <p style="margin:0 0 12px">${tmpl.greeting || '<span style="color:#9ca3af;font-style:italic">Saludo...</span>'}</p>
    <div style="white-space:pre-wrap;line-height:1.65">${tmpl.body || '<span style="color:#9ca3af;font-style:italic">Cuerpo del mensaje...</span>'}</div>
    ${cta}
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:18px 0">
    <p style="color:#9ca3af;font-size:12px;margin:0">${tmpl.signature || '<span style="font-style:italic">Firma...</span>'}</p>
  </div>
</div>`
}

export default function EmailMarketing() {
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
  const [tab, setTab] = useState('interested')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Test email
  const [testEmail, setTestEmail] = useState('')
  const [testOutcome, setTestOutcome] = useState('interested')
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Attachment
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getEmailSettings().then(data => {
      setCfg({
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
      })
    }).catch(() => {})
  }, [])

  const getTmpl = (k) => cfg.email_templates[k] || { ...EMPTY_TMPL }
  const setTmpl = (k, field, val) =>
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
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar')
    } finally { setSaving(false) }
  }

  const handleTest = async () => {
    if (!testEmail) return
    setTestLoading(true); setTestResult(null)
    try {
      await sendTestEmail({ to_email: testEmail, outcome: testOutcome })
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

  const activeTmpl = getTmpl(tab)
  const activeOutcome = OUTCOMES.find(o => o.key === tab)

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

      {/* Card 1 — Activar + remitente */}
      <div className="bg-z-card rounded-xl p-5 border border-z-border space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setCfg(p => ({ ...p, email_enabled: !p.email_enabled }))}
            className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${cfg.email_enabled ? 'bg-blue-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.email_enabled ? 'translate-x-4' : ''}`} />
          </div>
          <span className="text-sm font-medium text-slate-200">Activar emails automáticos post-llamada</span>
        </label>

        <div className={`grid grid-cols-2 gap-3 transition-opacity ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email remitente</label>
            <input type="email" value={cfg.email_from}
              onChange={e => setCfg(p => ({ ...p, email_from: e.target.value }))}
              placeholder="info@empresa.com" className="z-input text-sm" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Nombre remitente</label>
            <input type="text" value={cfg.email_from_name}
              onChange={e => setCfg(p => ({ ...p, email_from_name: e.target.value }))}
              placeholder="Isabella - Mi Empresa" className="z-input text-sm" />
          </div>
        </div>
      </div>

      {/* Card 2 — Plantillas por resultado */}
      <div className={`bg-z-card rounded-xl border border-z-border overflow-hidden transition-opacity ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
        {/* Tabs */}
        <div className="flex border-b border-z-border">
          {OUTCOMES.map(o => {
            const isOn = cfg[o.flag]
            return (
              <button
                key={o.key}
                onClick={() => setTab(o.key)}
                className={`flex-1 px-3 py-3 text-xs font-medium transition-colors relative ${
                  tab === o.key ? 'text-slate-100 bg-black/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {o.label}
                <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${isOn ? 'bg-green-400' : 'bg-slate-600'}`} />
              </button>
            )
          })}
        </div>

        <div className="p-5 space-y-4">
          {/* Outcome toggle */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setCfg(p => ({ ...p, [activeOutcome.flag]: !p[activeOutcome.flag] }))}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${cfg[activeOutcome.flag] ? 'bg-blue-500' : 'bg-slate-700'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg[activeOutcome.flag] ? 'translate-x-4' : ''}`} />
            </div>
            <span className="text-sm text-slate-300">Enviar email cuando resultado sea <strong className="text-slate-100">{activeOutcome.label}</strong></span>
          </label>

          <p className="text-xs text-slate-500">
            Variables: <span className="font-mono text-blue-400">{'{{nombre}}  {{empresa}}  {{agente}}  {{resumen}}  {{telefono}}  {{fecha}}'}</span>
          </p>

          {/* Template form */}
          <div className="space-y-3">
            <input type="text" value={activeTmpl.subject}
              onChange={e => setTmpl(tab, 'subject', e.target.value)}
              placeholder="Asunto del email — ej: Gracias por su interés, {{nombre}}"
              className="z-input text-sm" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Saludo</label>
                <input type="text" value={activeTmpl.greeting}
                  onChange={e => setTmpl(tab, 'greeting', e.target.value)}
                  placeholder="Estimado/a {{nombre}}," className="z-input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Color de cabecera</label>
                <div className="flex gap-2 items-center">
                  <input type="color" value={activeTmpl.color || '#4F46E5'}
                    onChange={e => setTmpl(tab, 'color', e.target.value)}
                    className="w-9 h-9 rounded border border-z-border cursor-pointer bg-transparent" />
                  <input type="text" value={activeTmpl.color || '#4F46E5'}
                    onChange={e => setTmpl(tab, 'color', e.target.value)}
                    className="z-input text-sm font-mono flex-1" />
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Cuerpo del mensaje</label>
              <textarea rows={4} value={activeTmpl.body}
                onChange={e => setTmpl(tab, 'body', e.target.value)}
                placeholder="Escribe el contenido aquí..."
                className="z-input text-sm resize-none" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Botón (texto)</label>
                <input type="text" value={activeTmpl.cta_text}
                  onChange={e => setTmpl(tab, 'cta_text', e.target.value)}
                  placeholder="Agendar cita" className="z-input text-sm" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Botón (URL)</label>
                <input type="url" value={activeTmpl.cta_url}
                  onChange={e => setTmpl(tab, 'cta_url', e.target.value)}
                  placeholder="https://calendly.com/..." className="z-input text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs text-slate-400 mb-1 block">Firma</label>
              <input type="text" value={activeTmpl.signature}
                onChange={e => setTmpl(tab, 'signature', e.target.value)}
                placeholder="El equipo de {{agente}}" className="z-input text-sm" />
            </div>
          </div>

          {/* Preview */}
          <div>
            <p className="text-xs text-slate-500 mb-2 uppercase tracking-wide font-medium">Vista previa</p>
            <div className="rounded-lg overflow-hidden bg-white text-sm"
              dangerouslySetInnerHTML={{ __html: buildHtml(activeTmpl) }} />
          </div>
        </div>
      </div>

      {/* Card 3 — Adjunto + Prueba */}
      <div className={`bg-z-card rounded-xl p-5 border border-z-border space-y-4 transition-opacity ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>

        {/* Attachment */}
        <div>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <PaperClipIcon className="w-3.5 h-3.5" /> Adjunto (opcional)
          </h3>
          <p className="text-xs text-slate-500 mb-2">PDF o imagen, máx. 5 MB — se adjunta a todos los emails.</p>
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleAttach} />
            <button onClick={() => fileRef.current?.click()} disabled={attachUploading}
              className="z-btn-ghost border border-z-border text-sm disabled:opacity-50">
              {attachUploading ? 'Subiendo...' : cfg.email_attachment_name ? 'Reemplazar' : 'Subir adjunto'}
            </button>
            {cfg.email_attachment_name && (
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded truncate max-w-[200px]">
                {cfg.email_attachment_name}
              </span>
            )}
          </div>
          {attachMsg && (
            <p className={`text-xs mt-1.5 ${attachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{attachMsg.text}</p>
          )}
        </div>

        <div className="border-t border-z-border pt-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <PaperAirplaneIcon className="w-3.5 h-3.5" /> Enviar email de prueba
          </h3>
          <div className="flex gap-2">
            <input type="email" value={testEmail} onChange={e => setTestEmail(e.target.value)}
              placeholder="tu@correo.com" className="z-input text-sm flex-1" />
            <select value={testOutcome} onChange={e => setTestOutcome(e.target.value)} className="z-input text-sm w-40">
              {OUTCOMES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <button onClick={handleTest} disabled={testLoading || !testEmail}
              className="z-btn-primary text-sm disabled:opacity-50 whitespace-nowrap">
              {testLoading ? 'Enviando...' : 'Enviar prueba'}
            </button>
          </div>
          {testResult && (
            <p className={`text-xs mt-2 ${testResult.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testResult.ok ? '✓ Email de prueba enviado correctamente' : `✗ ${testResult.msg}`}
            </p>
          )}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pb-2">
        <button onClick={handleSave} disabled={saving} className="z-btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar configuración'}
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
