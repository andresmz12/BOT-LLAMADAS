import { useState, useEffect, useRef } from 'react'
import { CheckCircleIcon, EnvelopeIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import { getEmailSettings, saveEmailSettings, uploadEmailAttachment } from '../api/client'

const OUTCOME_LABELS = {
  interested: 'Interesado',
  callback_requested: 'Solicita callback',
  voicemail: 'Buzón de voz',
  not_interested: 'No interesado',
}

const OUTCOME_FLAGS = {
  interested: 'email_send_on_interested',
  callback_requested: 'email_send_on_callback',
  voicemail: 'email_send_on_voicemail',
  not_interested: 'email_send_on_not_interested',
}

const TEMPLATE_VARS = '{{nombre}}  {{empresa}}  {{agente}}  {{resumen}}  {{telefono}}  {{fecha}}'

const EMPTY_TMPL = { subject: '', color: '#4F46E5', greeting: '', body: '', cta_text: '', cta_url: '', signature: '' }

function buildPreviewHtml(tmpl) {
  const c = tmpl.color || '#4F46E5'
  const ctaBlock = tmpl.cta_text && tmpl.cta_url
    ? `<p style="text-align:center;margin:20px 0"><a href="${tmpl.cta_url}" style="background:${c};color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block">${tmpl.cta_text}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
  <div style="background:${c};padding:18px 24px"><h1 style="color:#fff;margin:0;font-size:16px">Mensaje de seguimiento</h1></div>
  <div style="padding:24px">
    <p style="margin-bottom:12px">${tmpl.greeting || '<em style="color:#9ca3af">Ingresa un saludo...</em>'}</p>
    <div style="white-space:pre-wrap;line-height:1.6">${tmpl.body || '<em style="color:#9ca3af">Ingresa el cuerpo del mensaje...</em>'}</div>
    ${ctaBlock}
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
    <p style="color:#6b7280;font-size:12px;margin:0">${tmpl.signature || '<em>Ingresa una firma...</em>'}</p>
  </div>
</div>`
}

export default function EmailMarketing() {
  const [emailCfg, setEmailCfg] = useState({
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
  const [activeOutcome, setActiveOutcome] = useState('interested')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    getEmailSettings().then(data => {
      setEmailCfg({
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

  const getTemplate = (outcome) => emailCfg.email_templates[outcome] || { ...EMPTY_TMPL }

  const setTemplate = (outcome, field, value) => {
    setEmailCfg(prev => ({
      ...prev,
      email_templates: {
        ...prev.email_templates,
        [outcome]: { ...getTemplate(outcome), [field]: value },
      },
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await saveEmailSettings({
        email_enabled: emailCfg.email_enabled,
        email_from: emailCfg.email_from || null,
        email_from_name: emailCfg.email_from_name || null,
        email_send_on_interested: emailCfg.email_send_on_interested,
        email_send_on_callback: emailCfg.email_send_on_callback,
        email_send_on_voicemail: emailCfg.email_send_on_voicemail,
        email_send_on_not_interested: emailCfg.email_send_on_not_interested,
        email_templates: emailCfg.email_templates,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleAttachUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setAttachMsg({ ok: false, text: 'El archivo supera el límite de 5 MB' })
      return
    }
    setAttachUploading(true)
    setAttachMsg(null)
    try {
      const res = await uploadEmailAttachment(file)
      setEmailCfg(prev => ({ ...prev, email_attachment_name: res.filename }))
      setAttachMsg({ ok: true, text: `Adjunto guardado: ${res.filename}` })
    } catch (err) {
      setAttachMsg({ ok: false, text: err.response?.data?.detail || 'Error al subir archivo' })
    } finally {
      setAttachUploading(false)
    }
  }

  const activeTmpl = getTemplate(activeOutcome)

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <EnvelopeIcon className="w-6 h-6 text-z-blue-light" />
            Email Marketing
          </h1>
          <p className="text-sm text-slate-500 mt-1">Envía emails automáticos a los prospectos después de cada llamada</p>
        </div>
        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
          emailCfg.sendgrid_configured
            ? 'bg-green-500/20 text-green-400'
            : 'bg-slate-700 text-slate-500'
        }`}>
          SendGrid {emailCfg.sendgrid_configured ? '✓ Configurado' : '✗ No configurado'}
        </span>
      </div>

      {/* Master toggle + sender */}
      <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">General</h2>

        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={emailCfg.email_enabled}
            onChange={e => setEmailCfg(p => ({ ...p, email_enabled: e.target.checked }))}
            className="w-4 h-4 accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-slate-300">Activar envío automático de emails tras cada llamada</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Email remitente</label>
            <input
              type="email"
              value={emailCfg.email_from}
              onChange={e => setEmailCfg(p => ({ ...p, email_from: e.target.value }))}
              placeholder="info@empresa.com"
              className="z-input text-sm"
              disabled={!emailCfg.email_enabled}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Nombre remitente</label>
            <input
              type="text"
              value={emailCfg.email_from_name}
              onChange={e => setEmailCfg(p => ({ ...p, email_from_name: e.target.value }))}
              placeholder="Isabella - Mi Empresa"
              className="z-input text-sm"
              disabled={!emailCfg.email_enabled}
            />
          </div>
        </div>
      </div>

      {/* Per-outcome toggles + template editor */}
      <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-4">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Plantillas por resultado</h2>
        <p className="text-xs text-slate-500">Variables disponibles: <span className="font-mono text-blue-400">{TEMPLATE_VARS}</span></p>

        <div className="space-y-2">
          {Object.entries(OUTCOME_LABELS).map(([outcome, label]) => {
            const flagKey = OUTCOME_FLAGS[outcome]
            const isOn = emailCfg[flagKey]
            const isActive = activeOutcome === outcome
            return (
              <div key={outcome} className="border border-z-border rounded-lg overflow-hidden">
                <div
                  className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => isOn && setActiveOutcome(isActive ? null : outcome)}
                >
                  <label className="flex items-center gap-3 cursor-pointer select-none" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={isOn}
                      disabled={!emailCfg.email_enabled}
                      onChange={e => {
                        setEmailCfg(p => ({ ...p, [flagKey]: e.target.checked }))
                        if (e.target.checked) setActiveOutcome(outcome)
                      }}
                      className="w-4 h-4 accent-blue-500 cursor-pointer"
                    />
                    <span className="text-sm text-slate-300">{label}</span>
                  </label>
                  {isOn && (
                    <span className="text-xs text-slate-500">{isActive ? '▲ Ocultar' : '▼ Editar plantilla'}</span>
                  )}
                </div>

                {isOn && isActive && (
                  <div className="border-t border-z-border p-4 space-y-3 bg-black/20">
                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1 block">Asunto</label>
                      <input
                        type="text"
                        value={activeTmpl.subject}
                        onChange={e => setTemplate(outcome, 'subject', e.target.value)}
                        placeholder="Ej: Gracias por su interés, {{nombre}}"
                        className="z-input text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">Color de cabecera</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={activeTmpl.color || '#4F46E5'}
                            onChange={e => setTemplate(outcome, 'color', e.target.value)}
                            className="w-10 h-10 rounded cursor-pointer border border-z-border bg-transparent"
                          />
                          <input
                            type="text"
                            value={activeTmpl.color || '#4F46E5'}
                            onChange={e => setTemplate(outcome, 'color', e.target.value)}
                            className="z-input text-sm font-mono flex-1"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">Saludo</label>
                        <input
                          type="text"
                          value={activeTmpl.greeting}
                          onChange={e => setTemplate(outcome, 'greeting', e.target.value)}
                          placeholder="Estimado/a {{nombre}},"
                          className="z-input text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1 block">Cuerpo del mensaje</label>
                      <textarea
                        rows={4}
                        value={activeTmpl.body}
                        onChange={e => setTemplate(outcome, 'body', e.target.value)}
                        placeholder="Escribe el contenido del email aquí..."
                        className="z-input text-sm resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">Texto del botón (CTA)</label>
                        <input
                          type="text"
                          value={activeTmpl.cta_text}
                          onChange={e => setTemplate(outcome, 'cta_text', e.target.value)}
                          placeholder="Agendar cita"
                          className="z-input text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-400 mb-1 block">URL del botón</label>
                        <input
                          type="url"
                          value={activeTmpl.cta_url}
                          onChange={e => setTemplate(outcome, 'cta_url', e.target.value)}
                          placeholder="https://calendly.com/..."
                          className="z-input text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1 block">Firma</label>
                      <input
                        type="text"
                        value={activeTmpl.signature}
                        onChange={e => setTemplate(outcome, 'signature', e.target.value)}
                        placeholder="El equipo de {{agente}}"
                        className="z-input text-sm"
                      />
                    </div>

                    {/* Live preview */}
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">Vista previa</p>
                      <div
                        className="rounded-lg overflow-hidden bg-white text-sm"
                        dangerouslySetInnerHTML={{ __html: buildPreviewHtml(activeTmpl) }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Attachment */}
      <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-3">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
          <PaperClipIcon className="w-4 h-4" /> Adjunto
        </h2>
        <p className="text-xs text-slate-500">PDF o imagen — máximo 5 MB. Se adjunta a todos los emails enviados.</p>
        {emailCfg.email_attachment_name && (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <PaperClipIcon className="w-4 h-4 text-slate-500" />
            <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded">{emailCfg.email_attachment_name}</span>
          </div>
        )}
        <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleAttachUpload} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachUploading || !emailCfg.email_enabled}
          className="z-btn-ghost border border-z-border text-sm disabled:opacity-50"
        >
          {attachUploading ? 'Subiendo...' : emailCfg.email_attachment_name ? 'Reemplazar adjunto' : 'Subir adjunto'}
        </button>
        {attachMsg && (
          <p className={`text-xs ${attachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>{attachMsg.text}</p>
        )}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="z-btn-primary disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
            <CheckCircleIcon className="w-4 h-4" /> Guardado correctamente
          </span>
        )}
      </div>
    </div>
  )
}
