import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { WaveformIcon } from '../components/Sidebar'
import { register, getMe } from '../api/client'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Register() {
  const { t } = useTranslation()
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '', company_name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) {
      setError(t('auth.passwordTooShort'))
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await register(form)
      localStorage.setItem('token', data.access_token)
      const user = await getMe()
      localStorage.setItem('user', JSON.stringify(user))
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || t('auth.registerError'))
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-z-bg flex items-center justify-center p-4 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-z-blue/10 border border-z-blue/30 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <WaveformIcon className="w-9 h-9 text-z-blue" />
          </div>
          <h1 className="text-2xl font-black">
            <span className="text-white">Zyra</span><span className="text-z-blue">Voice</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">{t('auth.registerTitle')}</p>
        </div>

        <form onSubmit={submit} className="bg-z-card border border-z-border rounded-2xl p-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.fullName')}</label>
            <input
              type="text" value={form.full_name} onChange={e => set('full_name', e.target.value)}
              className="z-input" placeholder={t('auth.fullNamePlaceholder')} required autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.email')}</label>
            <input
              type="email" value={form.email} onChange={e => set('email', e.target.value)}
              className="z-input" placeholder={t('auth.emailPlaceholder')} required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.phone')}</label>
            <input
              type="tel" value={form.phone} onChange={e => set('phone', e.target.value)}
              className="z-input" placeholder={t('auth.phonePlaceholder')} required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.password')}</label>
            <input
              type="password" value={form.password} onChange={e => set('password', e.target.value)}
              className="z-input" placeholder={t('auth.minPassword')} required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('auth.companyName')}</label>
            <input
              type="text" value={form.company_name} onChange={e => set('company_name', e.target.value)}
              className="z-input" placeholder={t('auth.companyNamePlaceholder')} required
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
            {loading ? t('auth.registering') : t('auth.createAccount')}
          </button>
        </form>

        <p className="text-center text-sm text-slate-500 mt-4">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="text-z-blue-light hover:underline font-medium">
            {t('auth.loginLink')}
          </Link>
        </p>
      </div>
    </div>
  )
}
