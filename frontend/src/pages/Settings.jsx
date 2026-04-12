import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { KeyIcon, PhoneIcon, CheckCircleIcon, PhoneArrowUpRightIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { getSettings, saveSettings, getAgents, makeDemoCall } from '../api/client'

export default function Settings() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ vapi_api_key: '', vapi_phone_number_id: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const [agents, setAgents] = useState([])
  const [demo, setDemo] = useState({ phone: '', agentId: '' })
  const [demoStatus, setDemoStatus] = useState(null) // null | 'loading' | 'ok' | 'error'
  const [demoError, setDemoError] = useState('')

  useEffect(() => {
    getSettings().then(data => {
      setForm(f => ({
        ...f,
        vapi_api_key: data.vapi_api_key || '',
        vapi_phone_number_id: data.vapi_phone_number_id || '',
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

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Credenciales VAPI</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <KeyIcon className="w-4 h-4 text-gray-400" /> VAPI API Key
            </label>
            <input
              type="password"
              value={form.vapi_api_key}
              onChange={e => setForm(f => ({ ...f, vapi_api_key: e.target.value }))}
              placeholder="vapi_••••••••"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Obtén tu API key en <span className="text-gold">dashboard.vapi.ai → Account → API Keys</span>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <PhoneIcon className="w-4 h-4 text-gray-400" /> VAPI Phone Number ID
            </label>
            <input
              type="text"
              value={form.vapi_phone_number_id}
              onChange={e => setForm(f => ({ ...f, vapi_phone_number_id: e.target.value }))}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">
              Obtén el ID en <span className="text-gold">dashboard.vapi.ai → Phone Numbers</span>
            </p>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
          <p className="font-semibold mb-1">Nota sobre variables de entorno</p>
          <p>Para producción en Railway, configura también <code className="bg-blue-100 px-1 rounded">VAPI_API_KEY</code>,{' '}
            <code className="bg-blue-100 px-1 rounded">VAPI_PHONE_NUMBER_ID</code> y{' '}
            <code className="bg-blue-100 px-1 rounded">ANTHROPIC_API_KEY</code> como variables de entorno en el servicio backend.
            Los valores guardados aquí se usan como respaldo desde la base de datos.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50"
          >
            {loading ? 'Guardando...' : 'Guardar configuración'}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircleIcon className="w-4 h-4" /> Guardado correctamente
            </span>
          )}
        </div>
      </form>

      {/* Demo Call */}
      <form onSubmit={handleDemoCall} className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 space-y-5">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Llamada Demo</h2>
        <p className="text-sm text-gray-500">Haz una llamada de prueba sin necesidad de crear una campaña. El resultado aparecerá en la sección Llamadas.</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
              <PhoneArrowUpRightIcon className="w-4 h-4 text-gray-400" /> Número de teléfono
            </label>
            <input
              type="tel"
              required
              value={demo.phone}
              onChange={e => setDemo(d => ({ ...d, phone: e.target.value }))}
              placeholder="+521234567890"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold font-mono"
            />
            <p className="text-xs text-gray-400 mt-1">Formato E.164 con código de país</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Agente</label>
            <select
              required
              value={demo.agentId}
              onChange={e => setDemo(d => ({ ...d, agentId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
            >
              <option value="">Seleccionar agente...</option>
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={demoStatus === 'loading' || !demo.phone || !demo.agentId}
            className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50 flex items-center gap-2"
          >
            <PhoneArrowUpRightIcon className="w-4 h-4" />
            {demoStatus === 'loading' ? 'Iniciando...' : 'Iniciar llamada demo'}
          </button>
          {demoStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircleIcon className="w-4 h-4" />
              Llamada iniciada —{' '}
              <button type="button" onClick={() => navigate('/calls')} className="underline">
                ver en Llamadas
              </button>
            </span>
          )}
          {demoStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
              <ExclamationCircleIcon className="w-4 h-4" /> {demoError}
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
