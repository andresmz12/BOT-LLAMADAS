import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyIcon, PhoneIcon, CheckCircleIcon, PhoneArrowUpRightIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { getSettings, saveSettings, getAgents, makeDemoCall, getCRMSettings, testMyCRMWebhook, getMyCRMLogs } from '../api/client'

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

export default function Settings() {
  const navigate = useNavigate()
  const isSuperAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin'

  const [form, setForm] = useState({
    retell_api_key: '',
    retell_phone_number: '',
    anthropic_api_key: '',
  })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [agents, setAgents] = useState([])
  const [demo, setDemo] = useState({ phone: '', agentId: '' })
  const [demoStatus, setDemoStatus] = useState(null)
  const [demoError, setDemoError] = useState('')

  const [crmConfig, setCrmConfig] = useState(null)
  const [crmLogs, setCrmLogs] = useState([])
  const [crmTestResult, setCrmTestResult] = useState(null)
  const [crmTestLoading, setCrmTestLoading] = useState(false)

  useEffect(() => {
    getSettings().then(data => {
      setForm(f => ({
        ...f,
        retell_api_key: data.retell_api_key || '',
        retell_phone_number: data.retell_phone_number || '',
        anthropic_api_key: data.anthropic_api_key || '',
      }))
    }).catch(() => {})
    getAgents().then(setAgents).catch(() => {})
    getCRMSettings().then(setCrmConfig).catch(() => {})
    getMyCRMLogs().then(setCrmLogs).catch(() => {})
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

  const handleDemoCall = async (e) => {
    e.preventDefault()
    setDemoStatus('loading')
    setDemoError('')
    try {
      await makeDemoCall(demo.phone, Number(demo.agentId))
      setDemoStatus('ok')
    } catch (err) {
      setDemoError(err.response?.data?.detail || 'Error al iniciar llamada')
      setDemoStatus('error')
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

      <form onSubmit={handleDemoCall} className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Llamada Demo</h2>
        <p className="text-sm text-slate-500">Haz una llamada de prueba sin necesidad de crear una campaña. El resultado aparecerá en la sección Llamadas.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <PhoneArrowUpRightIcon className="w-4 h-4 text-slate-500" /> Número de teléfono
            </label>
            <input
              type="tel"
              required
              value={demo.phone}
              onChange={e => setDemo(d => ({ ...d, phone: e.target.value }))}
              placeholder="+521234567890"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">Formato E.164 con código de país</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Agente</label>
            <select
              required
              value={demo.agentId}
              onChange={e => setDemo(d => ({ ...d, agentId: e.target.value }))}
              className="z-input"
            >
              <option value="">Seleccionar agente...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.agent_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={demoStatus === 'loading' || !demo.phone || !demo.agentId}
            className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <PhoneArrowUpRightIcon className="w-4 h-4" />
            {demoStatus === 'loading' ? 'Iniciando...' : 'Iniciar llamada demo'}
          </button>
          {demoStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
              <CheckCircleIcon className="w-4 h-4" />
              Llamada iniciada —{' '}
              <button type="button" onClick={() => navigate('/calls')} className="underline">
                ver en Llamadas
              </button>
            </span>
          )}
          {demoStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-400 font-medium">
              <ExclamationCircleIcon className="w-4 h-4" /> {demoError}
            </span>
          )}
        </div>
      </form>

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

                <button
                  type="button"
                  onClick={() => window.location.href = '/admin'}
                  className="text-xs text-z-blue-light hover:underline"
                >
                  Editar en Panel de Administración →
                </button>

                {crmLogs.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Últimos envíos
                    </h3>
                    <div className="space-y-0 rounded-lg border border-z-border overflow-hidden">
                      {crmLogs.map((log, i) => (
                        <div
                          key={log.id}
                          className={`flex items-center justify-between text-xs px-4 py-2.5 ${
                            i < crmLogs.length - 1 ? 'border-b border-z-border/50' : ''
                          } hover:bg-white/[0.02]`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              log.success ? 'bg-green-400' : 'bg-red-400'
                            }`} />
                            <span className="text-slate-500 font-mono flex-shrink-0">
                              {new Date(log.created_at).toLocaleString('es-MX', {
                                month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            <span className="text-slate-400 truncate">{log.event_type}</span>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0 text-slate-500">
                            {log.status_code && (
                              <span className={log.success ? 'text-green-500' : 'text-red-500'}>
                                {log.status_code}
                              </span>
                            )}
                            <span>{log.duration_ms}ms</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {crmLogs.length === 0 && isConfigured && (
                  <p className="text-xs text-slate-600">No hay envíos registrados aún.</p>
                )}
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
