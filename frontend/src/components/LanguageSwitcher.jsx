import { useTranslation } from 'react-i18next'

const FLAG = { es: '🇪🇸', en: '🇺🇸' }

export default function LanguageSwitcher({ className = '', variant = 'pill' }) {
  const { i18n } = useTranslation()
  const lang = (i18n.resolvedLanguage || i18n.language || 'es').startsWith('en') ? 'en' : 'es'

  const toggle = () => {
    i18n.changeLanguage(lang === 'es' ? 'en' : 'es')
  }

  if (variant === 'flag') {
    return (
      <button
        onClick={toggle}
        title={lang === 'es' ? 'Switch to English' : 'Cambiar a español'}
        className={`flex items-center justify-center w-9 h-9 text-lg rounded-full border border-white/10 bg-sidebar hover:border-white/25 hover:bg-white/5 transition-colors shadow-sm ${className}`}
      >
        <span>{FLAG[lang]}</span>
      </button>
    )
  }

  return (
    <button
      onClick={toggle}
      title={lang === 'es' ? 'Switch to English' : 'Cambiar a español'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-white/10 hover:border-white/25 text-slate-400 hover:text-slate-100 transition-colors ${className}`}
    >
      <span className={lang === 'es' ? 'text-slate-100' : ''}>ES</span>
      <span className="text-slate-600">/</span>
      <span className={lang === 'en' ? 'text-slate-100' : ''}>EN</span>
    </button>
  )
}
