import { LockClosedIcon, EnvelopeIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'

const SUPPORT_EMAIL = "soporte@ismconsulting.com"
const SUPPORT_WHATSAPP = "https://wa.me/13056061812"

export default function UpgradeBanner({ demosUsed = 0, demosTotal = 10, compact = false }) {
  const { t } = useTranslation()

  if (compact) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm">
        <LockClosedIcon className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <p className="text-amber-300 flex-1">
          {t('upgrade.compact', { used: demosUsed, total: demosTotal })}
        </p>
        <div className="flex gap-2 flex-shrink-0">
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-xs font-medium transition-colors"
          >
            {t('upgrade.email_btn')}
          </a>
          <a
            href={SUPPORT_WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors"
          >
            WhatsApp
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-4">
        <LockClosedIcon className="w-8 h-8 text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-slate-100 mb-2">{t('upgrade.title')}</h2>
      <p className="text-slate-400 text-sm max-w-md mb-2">
        {t('upgrade.desc', { used: demosUsed, total: demosTotal })}
      </p>
      <p className="text-slate-400 text-sm max-w-md">{t('upgrade.desc2')}</p>
      <div className="flex gap-3 mt-4">
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="flex items-center gap-2 px-4 py-2 bg-z-blue hover:bg-z-blue-dark text-white rounded-lg text-sm font-medium transition-colors"
        >
          <EnvelopeIcon className="w-4 h-4" />
          {t('upgrade.email_btn')}
        </a>
        <a
          href={SUPPORT_WHATSAPP}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          {t('upgrade.whatsapp_btn')}
        </a>
      </div>
    </div>
  )
}
