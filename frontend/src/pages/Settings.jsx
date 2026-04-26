import { useState, useEffect } from 'react'
import { KeyIcon, PhoneIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { getSettings, saveSettings, getCRMSettings, testMyCRMWebhook } from '../api/client'

const CRM_TYPE_LABELS = {
  zapier: 'Zapier',
  make: 'Make (Integromat)',
  gohighlevel: 'GoHighLevel',
  hubspot: 'HubSpot',
  monday: 'Monday.com',
  zoho: 'Zoho CRM',
  airtable: 'Airtable',
  notion: 'Notion',
  pipedrive: 'Pipedrive',
  salesforce: 'Salesforce',
  n8n: 'n8n',
  custom: 'Webhook',
}

const NATIVE_CRM_TYPES = ['monday', 'hubspot', 'gohighlevel', 'zoho', 'salesforce']

export default function Settings() {
  const { t } = useTranslation()
  const isSuperAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin'

  const [form, setForm] = useState({ retell_api_key: '', retell_phone_number: '', anthropic_api_key: '' })
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [crmConfig, setCrmConfig] = useState(null)
  const [crmTestResult, setCrmTestResult] = useState(null)
  const [crmTestLoading, setCrmTestLoading] = useState(false)

  useEffect(() => {
    getSettings().then(data => {
      setForm(f => ({
        ...f,
        retell_api_key: data.retell_api_key || '',
        retell_phone_number: data.retell_phone_number || '',
        anthropic_api_key: data.anthropic_api_key || '',
      }))
    }).catch(() => {})
    getCRMSettings().then(setCrmConfig).catch(() => {})
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
      alert(err.response?.data?.detail || 'Error')
    } finally {
      setLoading(false)
    }
  }

  const handleCrmTest = async () => {
    setCrmTestLoading(true)
    setCrmTestResult(null)
    try {
      const res = await testMyCRMWebhook()
      setCrmTestResult(res)
    } catch (err) {
      setCrmTestResult({ success: false, response: err.response?.data?.detail || 'Error' })
    } finally {
      setCrmTestLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-100">{t('settings.title')}</h1>

      {isSuperAdmin && <form onSubmit={submit} className="space-y-6">
        <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('settings.retell_section')}</h2>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <KeyIcon className="w-4 h-4 text-slate-500" /> {t('settings.retell_key_label')}
            </label>
            <input
              type="password"
              value={form.retell_api_key}
              onChange={e => setForm(f => ({ ...f, retell_api_key: e.target.value }))}
              placeholder="key_••••••••"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">{t('settings.retell_key_hint')}</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <PhoneIcon className="w-4 h-4 text-slate-500" /> {t('settings.retell_phone_label')}
            </label>
            <input
              type="text"
              value={form.retell_phone_number}
              onChange={e => setForm(f => ({ ...f, retell_phone_number: e.target.value }))}
              placeholder="+12025551234"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">{t('settings.retell_phone_hint')}</p>
          </div>

          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-300 mb-1.5">
              <KeyIcon className="w-4 h-4 text-slate-500" /> {t('settings.anthropic_key_label')}
            </label>
            <input
              type="password"
              value={form.anthropic_api_key}
              onChange={e => setForm(f => ({ ...f, anthropic_api_key: e.target.value }))}
              placeholder="sk-ant-••••••••"
              className="z-input font-mono"
            />
            <p className="text-xs text-slate-500 mt-1">{t('settings.anthropic_key_hint')}</p>
          </div>
        </div>

        <div className="bg-z-blue/10 border border-z-blue/30 rounded-xl p-4 text-sm text-blue-300 space-y-2">
          <p className="font-semibold text-blue-200">{t('settings.webhook_info_title')}</p>
          <p>{t('settings.webhook_info_desc')}</p>
          <ol className="list-decimal list-inside space-y-1 mt-1">
            <li>{t('settings.webhook_step1')}</li>
            <li>{t('settings.webhook_step2')} <code className="bg-z-blue/20 px-1 rounded">https://TU-BACKEND.railway.app/webhook/retell</code></li>
            <li>{t('settings.webhook_step3')} <strong>call_ended</strong> y <strong>call_analyzed</strong></li>
          </ol>
          <p className="text-xs mt-2 text-blue-400">{t('settings.webhook_warning')}</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="z-btn-primary disabled:opacity-50"
          >
            {loading ? t('common.saving') : t('settings.save_btn')}
          </button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-400 font-medium">
              <CheckCircleIcon className="w-4 h-4" /> {t('settings.saved_ok')}
            </span>
          )}
        </div>
      </form>}

      {/* CRM & Webhooks */}
      {crmConfig && (
        <div className="bg-z-card rounded-xl p-6 border border-z-border space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('settings.crm_section')}</h2>

          {(() => {
            const isNative = NATIVE_CRM_TYPES.includes(crmConfig.crm_type)
            const isConfigured = crmConfig.crm_webhook_enabled && (
              isNative ? crmConfig.crm_api_key_configured : !!crmConfig.crm_webhook_url
            )
            const hasType = crmConfig.crm_type && crmConfig.crm_type !== 'none'

            return (
              <>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-slate-200">
                      {hasType
                        ? CRM_TYPE_LABELS[crmConfig.crm_type] || crmConfig.crm_type
                        : t('common.not_configured')
                      }
                    </p>
                    {isNative && crmConfig.crm_api_key_configured && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        {t('settings.crm_api_key_set')}
                        {crmConfig.crm_board_or_list_id && (
                          <span className="font-mono ml-1">· ID: {crmConfig.crm_board_or_list_id}</span>
                        )}
                      </p>
                    )}
                    {!isNative && crmConfig.crm_webhook_url && (
                      <p className="text-xs text-slate-500 font-mono mt-0.5 break-all">
                        {crmConfig.crm_webhook_url.replace(/^(https?:\/\/[^/]+)(.*)$/, (_, host, path) =>
                          host + (path.length > 20 ? path.slice(0, 20) + '...' : path)
                        )}
                      </p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-2.5 py-1 text-xs rounded-full font-medium ${
                    isConfigured
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-slate-700 text-slate-500'
                  }`}>
                    {isConfigured ? t('common.configured') : t('common.not_configured')}
                  </span>
                </div>

                {!isNative && crmConfig.crm_webhook_url && (
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCrmTest}
                      disabled={crmTestLoading}
                      className="z-btn-ghost border border-z-border text-sm disabled:opacity-50"
                    >
                      {crmTestLoading ? t('settings.crm_testing') : t('settings.crm_test_btn')}
                    </button>
                    {crmTestResult && (
                      <div className={`text-xs rounded-lg px-3 py-2 ${
                        crmTestResult.success
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {crmTestResult.success
                          ? t('settings.crm_test_ok', { code: crmTestResult.status_code })
                          : t('settings.crm_test_fail', { msg: crmTestResult.response })
                        }
                      </div>
                    )}
                  </div>
                )}

                {!hasType && (
                  <p className="text-xs text-slate-500">{t('settings.no_crm')}</p>
                )}
              </>
            )
          })()}
        </div>
      )}

    </div>
  )
}
