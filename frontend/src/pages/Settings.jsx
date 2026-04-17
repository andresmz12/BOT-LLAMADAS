import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyIcon, PhoneIcon, CheckCircleIcon, PhoneArrowUpRightIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { getSettings, saveSettings, getAgents, makeDemoCall } from '../api/client'

export default function Settings() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ retell_api_key: '', retell_phone_number: '', anthropic_api_key: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [agents, setAgents] = useState([])
  const [demo, setDemo] = useState({ phone: '', agentId: '' })
  const [demoStatus, setDemoStatus] = useState(null)
  const [demoError, setDemoError] = useState('')

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

  const inputCls = "w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue focus:ring-1 focus:ring-zyra-blue font-mono"

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-zyra-text">Configuración</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-zyra-card rounded-xl p-6 border border-zyra-border space-y-5">
          <h2 className="text-sm font-semibold text-zyra-muted uppercase tracking-wide">Credenciales Retell AI</h2>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-zyra-muted mb-1.5">
              <KeyIcon className="w-4 h-4" /> Retell API Key
            </label>
            <input type="password" value={form.retell_api_key}
              onChange={e => setForm(f => ({ ...f, retell_api_key: e.target.value }))}
              placeholder="key_••••••••" className={inputCls} />
            <p className="text-xs text-zyra-muted mt-1">
              Obtén tu API key en <span className="text-zyra-blue">app.retellai.com → Settings → API Keys</span>
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-zyra-muted mb-1.5">
              <PhoneIcon className="w-4 h-4" /> Número de teléfono Retell
            </label>
            <input type="text" value={form.retell_phone_number}
              onChange={e => setForm(f => ({ ...f, retell_phone_number: e.target.value }))}
              placeholder="+12025551234" className={inputCls} />
            <p className="text-xs text-zyra-muted mt-1">
              Formato E.164 — compra un número en <span className="text-zyra-blue">app.retellai.com → Phone Numbers</span>
            </p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-zyra-muted mb-1.5">
              <KeyIcon className="w-4 h-4" /> Anthropic API Key
            </label>
            <input type="password" value={form.anthropic_api_key}
              onChange={e => setForm(f => ({ ...f, anthropic_api_key: e.target.value }))}
              placeholder="sk-ant-••••••••" className={inputCls} />
            <p className="text-xs text-zyra-muted mt-1">
              Usada para analizar transcripciones — <span className="text-zyra-blue">console.anthropic.com → API Keys</span>
            </p>
          </div>
        </div>

        <div className="bg-blue-900/20 border border-blue-800/40 rounded-xl p-4 text-sm text-blue-300 space-y-2">
          <p className="font-semibold">Configura el webhook en Retell AI</p>
          <p>Para recibir transcripciones y resultados de llamadas, configura el webhook en tu cuenta de Retell:</p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>Ve a <span className="font-mono font-medium">app.retellai.com → Settings → Webhooks</span></li>
            <li>Agrega la URL: <code className="bg-blue-900/40 px-1 rounded">https://TU-BACKEND.railway.app/webhook/retell</code></li>
            <li>Selecciona los eventos: <strong>call_ended</strong> y <strong>call_analyzed</strong></li>
          </ol>
          <p className="text-xs mt-2 text-blue-400">Sin este paso las llamadas se realizan pero no se guardan resultados.</p>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading}
            className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
              <CheckCircleIcon className="w-4 h-4" /> Guardado correctamente
            </span>
          )}
        </div>
      </form>

      <form onSubmit={handleDemoCall} className="bg-zyra-card rounded-xl p-6 border border-zyra-border space-y-5">
        <h2 className="text-sm font-semibold text-zyra-muted uppercase tracking-wide">Llamada Demo</h2>
        <p className="text-sm text-zyra-muted">Haz una llamada de prueba sin necesidad de crear una campaña. El resultado aparecerá en la sección Llamadas.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-zyra-muted mb-1.5">
              <PhoneArrowUpRightIcon className="w-4 h-4" /> Número de teléfono
            </label>
            <input type="tel" required value={demo.phone}
              onChange={e => setDemo(d => ({ ...d, phone: e.target.value }))}
              placeholder="+521234567890" className={inputCls} />
            <p className="text-xs text-zyra-muted mt-1">Formato E.164 con código de país</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1.5">Agente</label>
            <select required value={demo.agentId}
              onChange={e => setDemo(d => ({ ...d, agentId: e.target.value }))}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue">
              <option value="">Seleccionar agente...</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={demoStatus === 'loading' || !demo.phone || !demo.agentId}
            className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center gap-2">
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
    </div>
  )
}
