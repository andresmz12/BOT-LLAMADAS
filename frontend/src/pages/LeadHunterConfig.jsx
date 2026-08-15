import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { getLeadHunterConfig, saveLeadHunterConfig } from '../api/client'

export default function LeadHunterConfig() {
  const { t } = useTranslation()
  const [form, setForm] = useState({
    lh_target_description: '',
    lh_offer_description: '',
    lh_cities: '',
    lh_language: 'es',
    lh_channel: 'whatsapp',
    lh_active: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getLeadHunterConfig()
      .then(data => setForm(prev => ({ ...prev, ...data })))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    try {
      await saveLeadHunterConfig(form)
      setMsg({ ok: true, text: t('leadHunterConfig.savedOk') })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || t('leadHunterConfig.saveError') })
    } finally { setSaving(false) }
  }

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  if (loading) return (
    <div className="p-6 text-sm text-slate-500">{t('leadHunterConfig.loading')}</div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <MagnifyingGlassIcon className="w-6 h-6 text-blue-400" /> {t('leadHunterConfig.title')}
            <span className="text-slate-500 font-normal text-base">{t('leadHunterConfig.subtitleSlash')}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('leadHunterConfig.subtitle')}</p>
        </div>
        <Link to="/lead-hunter"
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-z-border text-slate-400 hover:bg-white/5 transition-colors">
          {t('leadHunterConfig.backToLeadHunter')}
        </Link>
      </div>

      {/* Active toggle */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-200">{t('leadHunterConfig.activate')}</p>
          <p className="text-xs text-slate-500 mt-0.5">{t('leadHunterConfig.activateHint')}</p>
        </div>
        <button
          onClick={() => set('lh_active', !form.lh_active)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.lh_active ? 'bg-blue-600' : 'bg-slate-700'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.lh_active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Form */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-5">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Cog6ToothIcon className="w-4 h-4 text-slate-400" /> {t('leadHunterConfig.profileTitle')}
        </h2>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">
            {t('leadHunterConfig.whoSellTo')} <span className="text-red-400">*</span>
          </label>
          <textarea
            value={form.lh_target_description || ''}
            onChange={e => set('lh_target_description', e.target.value)}
            placeholder={t('leadHunterConfig.whoSellToPlaceholder')}
            rows={3}
            className="z-input w-full text-sm resize-none"
          />
          <p className="text-xs text-slate-600 mt-1">{t('leadHunterConfig.whoSellToHint')}</p>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">{t('leadHunterConfig.whatOffer')}</label>
          <textarea
            value={form.lh_offer_description || ''}
            onChange={e => set('lh_offer_description', e.target.value)}
            placeholder={t('leadHunterConfig.whatOfferPlaceholder')}
            rows={2}
            className="z-input w-full text-sm resize-none"
          />
          <p className="text-xs text-slate-600 mt-1">{t('leadHunterConfig.whatOfferHint')}</p>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">
            {t('leadHunterConfig.targetCities')} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.lh_cities || ''}
            onChange={e => set('lh_cities', e.target.value)}
            placeholder={t('leadHunterConfig.targetCitiesPlaceholder')}
            className="z-input w-full text-sm"
          />
          <p className="text-xs text-slate-600 mt-1">{t('leadHunterConfig.targetCitiesHint')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">{t('leadHunterConfig.messageLanguage')}</label>
            <select
              value={form.lh_language}
              onChange={e => set('lh_language', e.target.value)}
              className="z-input w-full text-sm"
            >
              <option value="es">{t('leadHunterConfig.onlySpanish')}</option>
              <option value="en">{t('leadHunterConfig.onlyEnglish')}</option>
              <option value="both">{t('leadHunterConfig.spanishAndEnglish')}</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">{t('leadHunterConfig.sendChannel')}</label>
            <select
              value={form.lh_channel}
              onChange={e => set('lh_channel', e.target.value)}
              className="z-input w-full text-sm"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
            </select>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !form.lh_target_description?.trim() || !form.lh_cities?.trim()}
          className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <><span className="animate-spin text-base">⟳</span> {t('leadHunterConfig.saving')}</> : t('leadHunterConfig.saveConfig')}
        </button>
        {msg && (
          <p className={`text-xs font-medium ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {msg.ok ? '✓' : '✗'} {msg.text}
          </p>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-blue-400">{t('leadHunterConfig.howItWorksTitle')}</p>
        <p>{t('leadHunterConfig.step1')}</p>
        <p>{t('leadHunterConfig.step2')}</p>
        <p>{t('leadHunterConfig.step3')}</p>
        <p>{t('leadHunterConfig.step4')}</p>
        <p>{t('leadHunterConfig.step5')}</p>
      </div>
    </div>
  )
}
