import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, getMe } from '../api/client'
import api from '../api/client'

function WaveIcon({ className = 'w-8 h-7' }) {
  return (
    <svg viewBox="0 0 28 24" fill="none" className={className}>
      <defs>
        <linearGradient id="wg-login" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="0"  y="9"  width="4" height="6"  rx="2" fill="url(#wg-login)" />
      <rect x="6"  y="5"  width="4" height="14" rx="2" fill="url(#wg-login)" />
      <rect x="12" y="1"  width="4" height="22" rx="2" fill="url(#wg-login)" />
      <rect x="18" y="5"  width="4" height="14" rx="2" fill="url(#wg-login)" />
      <rect x="24" y="9"  width="4" height="6"  rx="2" fill="url(#wg-login)" />
    </svg>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/', { replace: true })
    api.get('/auth/status').then(r => {
      if (!r.data.initialized) setNeedsSetup(true)
    }).catch(() => {})
  }, [])

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await login(email, password)
      localStorage.setItem('token', data.access_token)
      const user = await getMe()
      localStorage.setItem('user', JSON.stringify(user))
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al iniciar sesión')
      setLoading(false)
    }
  }

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/setup')
      setNeedsSetup(false)
      setSetupDone(true)
      setEmail('admin@ismconsulting.com')
    } catch (err) {
      setError(err.response?.data?.detail || 'Error al configurar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zyra-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <WaveIcon />
            <div className="flex items-baseline gap-0.5">
              <span className="text-white font-black text-3xl">Zyra</span>
              <span className="text-blue-400 font-black text-3xl">Voice</span>
            </div>
          </div>
          <p className="text-zyra-muted text-sm">Plataforma de llamadas con IA</p>
        </div>

        {needsSetup && (
          <div className="mb-4 p-4 bg-amber-900/30 border border-amber-600/40 rounded-xl text-sm text-amber-300">
            <p className="font-semibold mb-2">Sistema no inicializado</p>
            <p className="mb-3">No hay usuarios configurados. Haz clic para crear el administrador inicial.</p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? 'Configurando...' : 'Inicializar sistema'}
            </button>
          </div>
        )}

        {setupDone && (
          <div className="mb-4 p-3 bg-green-900/30 border border-green-600/40 rounded-xl text-sm text-green-400">
            Sistema inicializado. Inicia sesión con <strong>admin@ismconsulting.com</strong>
          </div>
        )}

        <form onSubmit={submit} className="bg-zyra-card rounded-2xl border border-zyra-border p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2.5 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue focus:ring-1 focus:ring-zyra-blue"
              placeholder="usuario@empresa.com"
              required autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2.5 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue focus:ring-1 focus:ring-zyra-blue"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
