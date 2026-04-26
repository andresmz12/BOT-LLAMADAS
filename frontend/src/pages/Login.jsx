import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { login, getMe } from '../api/client'
import api from '../api/client'

function WaveformIcon({ className }) {
  const bars = [
    { x: 1.5,  h: 8,  y: 12 },
    { x: 5.5,  h: 14, y: 9  },
    { x: 9.5,  h: 22, y: 5  },
    { x: 13.5, h: 28, y: 2  },
    { x: 17.5, h: 28, y: 2  },
    { x: 21.5, h: 22, y: 5  },
    { x: 25.5, h: 14, y: 9  },
    { x: 29,   h: 8,  y: 12 },
  ]
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="2" height={b.h} rx="1"
          opacity={0.4 + (i < 4 ? i : 7 - i) * 0.15} />
      ))}
    </svg>
  )
}

export default function Login() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [setupDone, setSetupDone] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/dashboard', { replace: true })
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
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('login.error_default'))
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
      setError(err.response?.data?.detail || t('login.setup_error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-z-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-z-blue/10 border border-z-blue/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <WaveformIcon className="w-9 h-9 text-z-blue" />
          </div>
          <h1 className="text-2xl font-black">
            <span className="text-white">Zyra</span><span className="text-z-blue">Voice</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t('login.subtitle')}</p>
        </div>

        {needsSetup && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
            <p className="font-semibold mb-2">{t('login.setup_title')}</p>
            <p className="mb-3 text-amber-400/80">{t('login.setup_desc')}</p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? t('login.setup_loading') : t('login.setup_btn')}
            </button>
          </div>
        )}

        {setupDone && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm text-green-400">
            {t('login.setup_done')} <strong>ISMadmin2024!</strong>
          </div>
        )}

        <form onSubmit={submit} className="bg-z-card border border-z-border rounded-2xl p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.email_label')}</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="z-input"
              placeholder={t('login.email_placeholder')}
              required autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('login.password_label')}</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="z-input"
              required
            />
          </div>
          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-z-blue hover:bg-z-blue-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50 transition-colors"
          >
            {loading ? t('login.submitting') : t('login.submit')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          {t('login.no_account')}{' '}
          <Link to="/register" className="text-z-blue-light hover:underline font-medium">
            {t('login.create_free')}
          </Link>
        </p>
      </div>
    </div>
  )
}
