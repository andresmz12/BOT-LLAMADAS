import { useState, useEffect, useRef } from 'react'
import { CheckCircleIcon, EnvelopeIcon, PaperClipIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import {
  getEmailSettings, saveEmailSettings, uploadEmailAttachment,
  sendTestEmail, bulkSendEmail, getCampaigns,
} from '../api/client'

const TEMPLATES = [
  { key: 'general',            label: 'General' },
  { key: 'interested',         label: 'Interesado' },
  { key: 'callback_requested', label: 'Callback' },
  { key: 'voicemail',          label: 'Buzón de voz' },
  { key: 'not_interested',     label: 'No interesado' },
]

const EMPTY_TMPL = { subject: '', color: '#4F46E5', greeting: '', body: '', cta_text: '', cta_url: '', signature: '' }

function buildHtml(t) {
  const c = t.color || '#4F46E5'
  const cta = t.cta_text && t.cta_url
    ? `<p style="text-align:center;margin:18px 0"><a href="${t.cta_url}" style="background:${c};color:#fff;padding:9px 20px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">${t.cta_text}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:${c};padding:14px 20px"><p style="color:#fff;margin:0;font-size:14px;font-weight:600">Mensaje</p></div>
  <div style="padding:20px;font-size:13px">
    <p style="margin:0 0 10px">${t.greeting || '<span style="color:#aaa;font-style:italic">Saludo...</span>'}</p>
    <div style="white-space:pre-wrap;line-height:1.6">${t.body || '<span style="color:#aaa;font-style:italic">Cuerpo del mensaje...</span>'}</div>
    ${cta}
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:16px 0">
    <p style="color:#aaa;font-size:11px;margin:0">${t.signature || '<span style="font-style:italic">Firma...</span>'}</p>
  </div>
</div>`
}

export default function EmailMarketing() {
  const [cfg, setCfg] = useState({
    email_enabled: false, email_from: '', email_from_name: '',
    sendgrid_configured: false,
    email_send_on_interested: true, email_send_on_callback: false,
    email_send_on_voicemail: false, email_send_on_not_interested: false,
    email_templates: {}, email_attachment_name: null,
  })
  const [campaigns, setCampaigns] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Envío masivo
  const [bulkCampaign, setBulkCampaign] = useState('')
  const [bulkTmpl, setBulkTmpl] = useState('general')
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)

  // Prueba
  const [testAddr, setTestAddr] = useState('')
  const [testTmpl, setTestTmpl] = useState('general')
  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState(null)

  // Editor de plantilla activa
  const [editingTmpl, setEditingTmpl] = useState('general')
  const [previewOpen, setPreviewOpen] = useState(false)

  // Adjunto
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    getEmailSettings().then(d => setCfg({
      email_enabled: d.email_enabled ?? false,
      email_from: d.email_from || '', email_from_name: d.email_from_name || '',
      sendgrid_configured: d.sendgrid_configured ?? false,
      email_send_on_interested: d.email_send_on_interested ?? true,
      email_send_on_callback: d.email_send_on_callback ?? false,
      email_send_on_voicemail: d.email_send_on_voicemail ?? false,
      email_send_on_not_interested: d.email_send_on_not_interested ?? false,
      email_templates: d.email_templates || {}, email_attachment_name: d.email_attachment_name || null,
    })).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  const getTmpl = k => cfg.email_templates[k] || { ...EMPTY_TMPL }
  const setTmplField = (k, f, v) =>
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [k]: { ...getTmpl(k), [f]: v } } }))

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await saveEmailSettings({
        email_enabled: cfg.email_enabled, email_from: cfg.email_from || null,
        email_from_name: cfg.email_from_name || null,
        email_send_on_interested: cfg.email_send_on_interested,
        email_send_on_callback: cfg.email_send_on_callback,
        email_send_on_voicemail: cfg.email_send_on_voicemail,
        email_send_on_not_interested: cfg.email_send_on_not_interested,
        email_templates: cfg.email_templates,
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
    finally { setSaving(false) }
  }

  const sendBulk = async () => {
    if (!confirm('¿Enviar emails a los prospectos seleccionados?')) return
    setBulkLoading(true); setBulkResult(null)
    try {
      const r = await bulkSendEmail({ campaign_id: bulkCampaign ? Number(bulkCampaign) : null, template_key: bulkTmpl })
      setBulkResult(r)
    } catch (e) { setBulkResult({ error: e.response?.data?.detail || 'Error' }) }
    finally { setBulkLoading(false) }
  }

  const sendTest = async () => {
    if (!testAddr) return
    setTestLoading(true); setTestMsg(null)
    try {
      await sendTestEmail({
        to_email: testAddr,
        outcome: testTmpl,
        template: cfg.email_templates[testTmpl] || {},
        from_email_override: cfg.email_from || null,
        from_name_override: cfg.email_from_name || null,
      })
      setTestMsg({ ok: true, text: 'Prueba enviada correctamente' })
    } catch (e) { setTestMsg({ ok: false, text: e.response?.data?.detail || 'Error' }) }
    finally { setTestLoading(false) }
  }

  const uploadAttach = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 5 * 1024 * 1024) { setAttachMsg({ ok: false, text: 'Máximo 5 MB' }); return }
    setAttachLoading(true); setAttachMsg(null)
    try {
      const r = await uploadEmailAttachment(f)
      setCfg(p => ({ ...p, email_attachment_name: r.filename }))
      setAttachMsg({ ok: true, text: r.filename })
    } catch (e) { setAttachMsg({ ok: false, text: 'Error al subir' }) }
    finally { setAttachLoading(false) }
  }

  const t = getTmpl(editingTmpl)

  return (
    <div className="p-6 space-y-5 max-w-xl">

      {/* ── Título ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <EnvelopeIcon className="w-6 h-6 text-z-blue-light" /> Email Marketing
        </h1>
        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${cfg.sendgrid_configured ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {cfg.sendgrid_configured ? '✓ Activo' : '⚠ Sin configurar'}
        </span>
      </div>

      {/* ── 1. ENVIAR ── */}
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="px-5 py-4 border-b border-z-border">
          <h2 className="text-sm font-semibold text-slate-200">Enviar emails</h2>
          <p className="text-xs text-slate-500 mt-0.5">Envía a tus prospectos ahora mismo, sin necesidad de llamadas</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Campaña</label>
              <select value={bulkCampaign} onChange={e => setBulkCampaign(e.target.value)} className="z-input-light text-sm">
                <option value="">Todos mis prospectos</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Plantilla</label>
              <select value={bulkTmpl} onChange={e => setBulkTmpl(e.target.value)} className="z-input-light text-sm">
                {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <button onClick={sendBulk} disabled={bulkLoading || !cfg.sendgrid_configured}
            className="z-btn-primary w-full disabled:opacity-50">
            {bulkLoading ? 'Enviando...' : 'Enviar ahora'}
          </button>

          {!cfg.sendgrid_configured && (
            <p className="text-xs text-amber-400">El administrador debe configurar SendGrid primero.</p>
          )}
          {bulkResult && (
            <div className={`text-xs rounded-lg px-3 py-2 ${bulkResult.error ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
              {bulkResult.error ? `✗ ${bulkResult.error}` : `✓ ${bulkResult.sent} emails enviados${bulkResult.skipped ? ` · ${bulkResult.skipped} fallaron` : ''}`}
            </div>
          )}

          {/* Prueba */}
          <div className="border-t border-z-border pt-3 space-y-2">
            <p className="text-xs text-slate-400 font-medium">Enviar prueba a mi correo</p>
            <div className="flex gap-2">
              <input type="email" value={testAddr} onChange={e => setTestAddr(e.target.value)}
                placeholder="mi@correo.com" className="z-input text-sm flex-1" />
              <select value={testTmpl} onChange={e => setTestTmpl(e.target.value)} className="z-input text-sm w-36">
                {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
              <button onClick={sendTest} disabled={testLoading || !testAddr}
                className="z-btn-ghost border border-z-border text-sm disabled:opacity-50 whitespace-nowrap">
                {testLoading ? '...' : 'Probar'}
              </button>
            </div>
            {testMsg && <p className={`text-xs ${testMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{testMsg.text}</p>}
          </div>
        </div>
      </div>

      {/* ── 2. PLANTILLA ── */}
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="px-5 py-4 border-b border-z-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Editar plantilla</h2>
            <p className="text-xs text-slate-500 mt-0.5">Variables: <span className="font-mono text-blue-400 text-xs">{'{{nombre}}  {{empresa}}  {{telefono}}  {{fecha}}'}</span></p>
          </div>
          <select value={editingTmpl} onChange={e => { setEditingTmpl(e.target.value); setPreviewOpen(false) }}
            className="z-input text-sm w-40">
            {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>

        <div className="p-5 space-y-3">
          <input type="text" value={t.subject} onChange={e => setTmplField(editingTmpl, 'subject', e.target.value)}
            placeholder="Asunto del email" className="z-input-light text-sm" />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Saludo</label>
              <input type="text" value={t.greeting} onChange={e => setTmplField(editingTmpl, 'greeting', e.target.value)}
                placeholder="Hola {{nombre}}," className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Color</label>
              <div className="flex gap-2">
                <input type="color" value={t.color || '#4F46E5'} onChange={e => setTmplField(editingTmpl, 'color', e.target.value)}
                  className="w-9 h-9 rounded border border-gray-300 cursor-pointer bg-white flex-shrink-0" />
                <input type="text" value={t.color || '#4F46E5'} onChange={e => setTmplField(editingTmpl, 'color', e.target.value)}
                  className="z-input-light text-sm font-mono flex-1" />
              </div>
            </div>
          </div>

          <textarea rows={4} value={t.body} onChange={e => setTmplField(editingTmpl, 'body', e.target.value)}
            placeholder="Cuerpo del mensaje..." className="z-input-light text-sm resize-none" />

          <div className="grid grid-cols-2 gap-3">
            <input type="text" value={t.cta_text} onChange={e => setTmplField(editingTmpl, 'cta_text', e.target.value)}
              placeholder="Texto del botón (opcional)" className="z-input-light text-sm" />
            <input type="url" value={t.cta_url} onChange={e => setTmplField(editingTmpl, 'cta_url', e.target.value)}
              placeholder="URL del botón" className="z-input-light text-sm" />
          </div>

          <input type="text" value={t.signature} onChange={e => setTmplField(editingTmpl, 'signature', e.target.value)}
            placeholder="Firma — ej: El equipo de {{agente}}" className="z-input-light text-sm" />

          {/* Preview collapsible */}
          <button onClick={() => setPreviewOpen(p => !p)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
            {previewOpen ? 'Ocultar vista previa' : 'Ver vista previa'}
          </button>
          {previewOpen && (
            <div className="rounded-lg overflow-hidden bg-white"
              dangerouslySetInnerHTML={{ __html: buildHtml(t) }} />
          )}
        </div>
      </div>

      {/* ── 3. CONFIGURACIÓN ── */}
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="px-5 py-4 border-b border-z-border">
          <h2 className="text-sm font-semibold text-slate-200">Configuración</h2>
        </div>
        <div className="p-5 space-y-4">

          {/* Remitente */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email remitente</label>
              <input type="email" value={cfg.email_from} onChange={e => setCfg(p => ({ ...p, email_from: e.target.value }))}
                placeholder="info@empresa.com" className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre remitente</label>
              <input type="text" value={cfg.email_from_name} onChange={e => setCfg(p => ({ ...p, email_from_name: e.target.value }))}
                placeholder="Isabella - Mi Empresa" className="z-input-light text-sm" />
            </div>
          </div>

          {/* Adjunto */}
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block flex items-center gap-1">
              <PaperClipIcon className="w-3.5 h-3.5" /> Adjunto a todos los emails (PDF o imagen, máx. 5 MB)
            </label>
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={uploadAttach} />
              <button onClick={() => fileRef.current?.click()} disabled={attachLoading}
                className="z-btn-ghost border border-z-border text-sm disabled:opacity-50">
                {attachLoading ? 'Subiendo...' : cfg.email_attachment_name ? 'Reemplazar' : 'Subir archivo'}
              </button>
              {cfg.email_attachment_name && (
                <span className="text-xs font-mono text-slate-400 truncate max-w-[160px]">{cfg.email_attachment_name}</span>
              )}
            </div>
            {attachMsg && <p className={`text-xs mt-1 ${attachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{attachMsg.ok ? `✓ ${attachMsg.text}` : attachMsg.text}</p>}
          </div>

          {/* Auto post-llamada */}
          <div className="border-t border-z-border pt-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Automático post-llamada</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setCfg(p => ({ ...p, email_enabled: !p.email_enabled }))}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${cfg.email_enabled ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.email_enabled ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-slate-400">{cfg.email_enabled ? 'Activo' : 'Inactivo'}</span>
              </label>
            </div>
            <p className="text-xs text-slate-500">Envía automáticamente al terminar una llamada según el resultado:</p>
            {[
              { flag: 'email_send_on_interested', label: 'Interesado' },
              { flag: 'email_send_on_callback',   label: 'Callback' },
              { flag: 'email_send_on_voicemail',  label: 'Buzón de voz' },
              { flag: 'email_send_on_not_interested', label: 'No interesado' },
            ].map(({ flag, label }) => (
              <label key={flag} className={`flex items-center gap-2.5 cursor-pointer ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                <input type="checkbox" checked={cfg[flag]}
                  onChange={e => setCfg(p => ({ ...p, [flag]: e.target.checked }))}
                  className="w-4 h-4 accent-blue-500" />
                <span className="text-sm text-slate-300">{label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Guardar */}
      <div className="flex items-center gap-3 pb-4">
        <button onClick={save} disabled={saving} className="z-btn-primary disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircleIcon className="w-4 h-4" /> Guardado</span>}
      </div>

    </div>
  )
}
