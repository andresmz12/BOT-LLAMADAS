import { useState, useEffect, useRef } from 'react'
import { KeyIcon, PhoneIcon, CheckCircleIcon, EnvelopeIcon, PaperClipIcon } from '@heroicons/react/24/outline'
import {
  getSettings, saveSettings, getCRMSettings, testMyCRMWebhook,
  getEmailSettings, saveEmailSettings, uploadEmailAttachment,
} from '../api/client'

const CRM_TYPE_LABELS = {
  zapier: 'Zapier',
  make: 'Make (Integromat)',
  gohighlevel: 'GoHighLevel',
  hubspot: 'HubSpot',
  monday: 'Monday.com',
  zoho: 'Zoho CRM',
  airtable: 'Airtable',
  notion: 'Notion',
  pipedrive: 'Pipedrive',
  salesforce: 'Salesforce',
  n8n: 'n8n',
  custom: 'Webhook personalizado',
}

const NATIVE_CRM_TYPES = ['monday', 'hubspot', 'gohighlevel', 'zoho', 'salesforce']

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

function buildPreviewHtml(tmpl, color) {
  const c = color || tmpl.color || '#4F46E5'
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

export default function Settings() {
  const isSuperAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin'

  const [form, setForm] = useState({ retell_api_key: '', retell_phone_number: '', anthropic_api_key: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [crmConfig, setCrmConfig] = useState(null)
  const [crmTestResult, setCrmTestResult] = useState(null)
  const [crmTestLoading, setCrmTestLoading] = useState(false)

  // Email marketing state
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
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSaved, setEmailSaved] = useState(false)
  const [attachUploading, setAttachUploading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    getSettings().then(data => {
      setForm(f => ({
        ...f,
        retell_api_key: data.retell_api_key || '',
        retell_phone_number: data.retell_phone_number || '',
        anthropic_api_key: data.anthropic_api_key || '',
      }))
    }).catch(() => {})
    getCRMSettings().then(setCrmConfig).catch(() => {})
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

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSaved(false)
    try {
      await saveSettings(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  const handleCrmTest = async () => {
    setCrmTestLoading(true)
    setCrmTestResult(null)
    try {
      const res = await testMyCRMWebhook()
      setCrmTestResult(res)
    } catch (err) {
      setCrmTestResult({ success: false, response: err.response?.data?.detail || 'Error de conexión' })
    } finally {
      setCrmTestLoading(false)
    }
  }

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

  const saveEmail = async () => {
    setEmailSaving(true)
    setEmailSaved(false)
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
      setEmailSaved(true)
      setTimeout(() => setEmailSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar configuración de email')
    } finally {
      setEmailSaving(false)
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
      <h1 className="text-2xl font-bold text-slate-100">Configuración</h1>

      {isSuperAdmin && <form onSubmit={submit} className="space-y-6">
        <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Credenciales Retell AI</h2>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <KeyIcon className="w-4 h-4 text-slate-500" /> Retell API Key
            </label>
            <input
              type="password"
              value={form.retell_api_key}
              onChange={e => setForm(f => ({ ...f, retell_api_key: e.target.value }))}
              placeholder="key_••••••••"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">
              Obtén tu API key en <span className="text-z-blue-light">app.retellai.com → Settings → API Keys</span>
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <PhoneIcon className="w-4 h-4 text-slate-500" /> Número de teléfono Retell
            </label>
            <input
              type="text"
              value={form.retell_phone_number}
              onChange={e => setForm(f => ({ ...f, retell_phone_number: e.target.value }))}
              placeholder="+12025551234"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">
              Formato E.164 — compra un número en <span className="text-z-blue-light">app.retellai.com → Phone Numbers</span>
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <KeyIcon className="w-4 h-4 text-slate-500" /> Anthropic API Key
            </label>
            <input
              type="password"
              value={form.anthropic_api_key}
              onChange={e => setForm(f => ({ ...f, anthropic_api_key: e.target.value }))}
              placeholder="sk-ant-••••••••"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">
              Usada para analizar transcripciones — <span className="text-z-blue-light">console.anthropic.com → API Keys</span>
            </p>
          </div>
        </div>

        <div className="bg-z-blue/10 border border-z-blue/30 rounded-xl p-4 text-sm text-blue-300 space-y-2">
          <p className="font-semibold text-blue-200">Configura el webhook en Retell AI</p>
          <p>Para recibir transcripciones y resultados de llamadas, configura el webhook en tu cuenta de Retell:</p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>Ve a <span className="font-mono font-medium">app.retellai.com → Settings → Webhooks</span></li>
            <li>Agrega la URL: <code className="bg-z-blue/20 px-1 rounded">https://TU-BACKEND.railway.app/webhook/retell</code></li>
            <li>Selecciona los eventos: <strong>call_ended</strong> y <strong>call_analyzed</strong></li>
          </ol>
          <p className="text-xs mt-2 text-blue-400">Sin este paso las llamadas se realizan pero no se guardan resultados.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="z-btn-primary disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
              <CheckCircleIcon className="w-4 h-4" /> Guardado correctamente
            </span>
          )}
        </div>
      </form>}

      {/* ── CRM & Webhooks ───────────────────────────────────────────────────── */}
      {crmConfig && (
        <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">CRM & Webhooks</h2>

          {(() => {
            const isNative = NATIVE_CRM_TYPES.includes(crmConfig.crm_type)
            const isConfigured = crmConfig.crm_webhook_enabled && (
              isNative ? crmConfig.crm_api_key_configured : !!crmConfig.crm_webhook_url
            )
            const hasType = crmConfig.crm_type && crmConfig.crm_type !== 'none'

            return (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {hasType
                        ? CRM_TYPE_LABELS[crmConfig.crm_type] || crmConfig.crm_type
                        : 'Sin integración configurada'
                      }
                    </p>
                    {isNative && crmConfig.crm_api_key_configured && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        API Key configurada
                        {crmConfig.crm_board_or_list_id && (
                          <span className="font-mono ml-1">· ID: {crmConfig.crm_board_or_list_id}</span>
                        )}
                      </p>
                    )}
                    {!isNative && crmConfig.crm_webhook_url && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">
                        {crmConfig.crm_webhook_url.replace(/^(https?:\/\/[^/]+)(.*)$/, (_, host, path) =>
                          host + (path.length > 20 ? path.slice(0, 20) + '...' : path)
                        )}
                      </p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-1 text-xs rounded-full font-medium ${
                    isConfigured
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-slate-700 text-slate-500'
                  }`}>
                    {isConfigured ? 'Configurado ✓' : 'No configurado'}
                  </span>
                </div>

                {!isNative && crmConfig.crm_webhook_url && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCrmTest}
                      disabled={crmTestLoading}
                      className="z-btn-ghost border border-z-border text-sm disabled:opacity-50"
                    >
                      {crmTestLoading ? 'Enviando prueba...' : 'Probar webhook'}
                    </button>
                    {crmTestResult && (
                      <div className={`text-xs rounded-lg px-3 py-2 ${
                        crmTestResult.success
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {crmTestResult.success
                          ? `✓ Webhook enviado correctamente (HTTP ${crmTestResult.status_code})`
                          : `✗ Error: ${crmTestResult.response}`
                        }
                      </div>
                    )}
                  </div>
                )}

                {!hasType && (
                  <p className="text-xs text-slate-500">
                    No hay ningún CRM conectado a esta organización.
                  </p>
                )}
              </>
            )
          })()}
        </div>
      )}

      {/* ── Email Marketing ──────────────────────────────────────────────────── */}
      <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-2">
            <EnvelopeIcon className="w-4 h-4" /> Email Marketing
          </h2>
          <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
            emailCfg.sendgrid_configured
              ? 'bg-green-500/20 text-green-400'
              : 'bg-slate-700 text-slate-500'
          }`}>
            SendGrid {emailCfg.sendgrid_configured ? '✓ Configurado' : '✗ No configurado'}
          </span>
        </div>

        {/* Master toggle */}
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={emailCfg.email_enabled}
            onChange={e => setEmailCfg(p => ({ ...p, email_enabled: e.target.checked }))}
            className="w-4 h-4 accent-blue-500 cursor-pointer"
          />
          <span className="text-sm text-slate-300">Activar envío automático de emails tras cada llamada</span>
        </label>

        {/* Sender info */}
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

        {/* Per-outcome toggles + template editor */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Enviar email cuando el resultado sea…</p>
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
                    <span className="text-xs text-slate-500">{isActive ? '▲ Ocultar plantilla' : '▼ Editar plantilla'}</span>
                  )}
                </div>

                {isOn && isActive && (
                  <div className="border-t border-z-border p-4 space-y-3 bg-black/20">
                    {/* Variables hint */}
                    <p className="text-xs text-slate-500">
                      Variables disponibles: <span className="font-mono text-blue-400">{TEMPLATE_VARS}</span>
                    </p>

                    <div>
                      <label className="text-xs font-medium text-slate-400 mb-1 block">Asunto del email</label>
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

                    {/* Live HTML preview */}
                    <div>
                      <p className="text-xs font-medium text-slate-400 mb-2">Vista previa</p>
                      <div
                        className="rounded-lg overflow-hidden bg-white text-sm"
                        dangerouslySetInnerHTML={{ __html: buildPreviewHtml(activeTmpl, activeTmpl.color) }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Attachment upload */}
        <div className="border border-z-border rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300 flex items-center gap-2">
              <PaperClipIcon className="w-4 h-4 text-slate-500" />
              Adjunto a todos los emails
            </p>
            {emailCfg.email_attachment_name && (
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded">
                {emailCfg.email_attachment_name}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">PDF o imagen — máximo 5 MB. Se adjunta a todos los emails enviados.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,image/*"
            className="hidden"
            onChange={handleAttachUpload}
          />
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

        {/* Save button */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={saveEmail}
            disabled={emailSaving}
            className="z-btn-primary disabled:opacity-50"
          >
            {emailSaving ? 'Guardando...' : 'Guardar configuración de email'}
          </button>
          {emailSaved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
              <CheckCircleIcon className="w-4 h-4" /> Guardado correctamente
            </span>
          )}
        </div>
      </div>

    </div>
  )
}
