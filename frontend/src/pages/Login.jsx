import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EnvelopeIcon, LockClosedIcon, EyeIcon, EyeSlashIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { login, getMe } from '../api/client'
import api from '../api/client'
import LanguageSwitcher from '../components/LanguageSwitcher'

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
  const [showPassword, setShowPassword] = useState(false)
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
      setError(err.response?.data?.detail || t('auth.loginError'))
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
      setError(err.response?.data?.detail || t('auth.setupError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-z-bg flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 bg-z-blue/20 rounded-full blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 w-96 h-96 bg-z-blue-light/10 rounded-full blur-[120px]" />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />

      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 bg-z-blue/30 rounded-2xl blur-xl" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-z-blue/20 to-z-blue/5 border border-z-blue/30 rounded-2xl flex items-center justify-center">
              <WaveformIcon className="w-9 h-9 text-z-blue-light" />
            </div>
          </div>
          <h1 className="text-2xl font-black">
            <span className="text-white">Zyra</span><span className="text-z-blue-light">Voice</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.platformSubtitle')}</p>
        </div>

        {needsSetup && (
          <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300">
            <p className="font-semibold mb-2">{t('auth.notInitialized')}</p>
            <p className="mb-3 text-amber-400/80">{t('auth.notInitializedHint')}</p>
            <button
              onClick={handleSetup}
              disabled={loading}
              className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {loading ? t('auth.initializing') : t('auth.initialize')}
            </button>
          </div>
        )}

        {setupDone && (
          <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-sm text-green-400">
            {t('auth.defaultPassword')} <strong>ISMadmin2024!</strong>
          </div>
        )}

        <form onSubmit={submit} className="bg-z-card/90 backdrop-blur border border-z-border rounded-2xl p-8 space-y-4 shadow-2xl shadow-black/40">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.email')}</label>
            <div className="relative">
              <EnvelopeIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                className="z-input pl-10"
                required autoFocus
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.password')}</label>
            <div className="relative">
              <LockClosedIcon className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                className="z-input pl-10 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
          {error && (
            <p className="flex items-start gap-1.5 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </p>
          )}
          <button
            type="submit" disabled={loading}
            className="w-full py-2.5 bg-gradient-to-r from-z-blue to-z-blue-light hover:from-z-blue-dark hover:to-z-blue text-white font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-z-blue/20 hover:shadow-z-blue/30 hover:-translate-y-0.5"
          >
            {loading ? t('auth.loggingIn') : t('auth.loginTitle')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="text-z-blue-light hover:underline font-medium">
            {t('auth.createAccount')}
          </Link>
        </p>
      </div>
    </div>
  )
}
