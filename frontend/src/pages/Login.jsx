import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, getMe } from '../api/client'
import api from '../api/client'

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
    // Check if system needs initial setup
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gold rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <span className="text-white font-black text-xl">ISM</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Voice Agent</h1>
          <p className="text-gray-500 text-sm mt-1">ISM Consulting Services</p>
        </div>

        {needsSetup && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
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
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            Sistema inicializado. Usa la contraseña: <strong>ISMadmin2024!</strong>
          </div>
        )}

        <form onSubmit={submit} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="usuario@empresa.com"
              required autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? 'Entrando...' : 'Iniciar sesión'}
          </button>
        </form>
      </div>
    </div>
  )
}
