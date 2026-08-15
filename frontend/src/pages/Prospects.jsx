import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpTrayIcon, TrashIcon, PlusIcon, XMarkIcon, PhoneArrowUpRightIcon, ArrowPathIcon, ClockIcon, ArrowDownTrayIcon, MagnifyingGlassIcon, SparklesIcon, UsersIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import ImportCSVModal from '../components/ImportCSVModal'
import UpgradeBanner from '../components/UpgradeBanner'
import CallDetailModal from '../components/CallDetailModal'
import OrgScopeBanner from '../components/OrgScopeBanner'
import { getProspects, deleteProspect, deleteAllProspects, retryProspects, getCampaigns, createProspect, callProspect, getDemoStatus, getCalls, expandKeywords } from '../api/client'
import { exportToCsv } from '../utils/exportCsv'
import { fmtDate } from '../utils/date'

const STATUSES = ['', 'pending', 'calling', 'answered', 'voicemail', 'failed', 'do_not_call']

const PHONE_PREFIXES = [
  { code: '+1',   flag: '🇺🇸', label: '+1' },
  { code: '+52',  flag: '🇲🇽', label: '+52' },
  { code: '+57',  flag: '🇨🇴', label: '+57' },
  { code: '+54',  flag: '🇦🇷', label: '+54' },
  { code: '+56',  flag: '🇨🇱', label: '+56' },
  { code: '+51',  flag: '🇵🇪', label: '+51' },
  { code: '+34',  flag: '🇪🇸', label: '+34' },
  { code: '+55',  flag: '🇧🇷', label: '+55' },
  { code: '+58',  flag: '🇻🇪', label: '+58' },
  { code: '+593', flag: '🇪🇨', label: '+593' },
  { code: '+502', flag: '🇬🇹', label: '+502' },
  { code: '+503', flag: '🇸🇻', label: '+503' },
  { code: '+504', flag: '🇭🇳', label: '+504' },
  { code: '+505', flag: '🇳🇮', label: '+505' },
  { code: '+506', flag: '🇨🇷', label: '+506' },
  { code: '+507', flag: '🇵🇦', label: '+507' },
  { code: '+598', flag: '🇺🇾', label: '+598' },
  { code: '+595', flag: '🇵🇾', label: '+595' },
  { code: '+591', flag: '🇧🇴', label: '+591' },
]

function NewProspectModal({ campaigns, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', phoneDigits: '', phonePrefix: '+1', company: '', campaign_id: campaigns[0]?.id || '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const phone = form.phonePrefix + form.phoneDigits.replace(/\D/g, '')
      await createProspect({ name: form.name, phone, company: form.company, campaign_id: Number(form.campaign_id) })
      onSaved()
    } catch (err) {
      alert(t('prospects.genericError') + ': ' + (err.response?.data?.detail || err.message))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{t('prospects.newProspect')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.nameLabel')}</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder={t('prospects.namePlaceholder')} className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.phoneLabel')}</label>
            <div className="flex gap-2">
              <select value={form.phonePrefix} onChange={e => set('phonePrefix', e.target.value)}
                className="z-input w-28 flex-shrink-0 font-mono">
                {PHONE_PREFIXES.map(p => (
                  <option key={p.code} value={p.code}>{p.flag} {p.label}</option>
                ))}
              </select>
              <input required value={form.phoneDigits} onChange={e => set('phoneDigits', e.target.value)}
                placeholder="5551234567" className="z-input flex-1 font-mono"
                inputMode="numeric" />
            </div>
            <p className="text-xs text-slate-500 mt-1">{t('prospects.digitsHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.companyLabel')}</label>
            <input value={form.company} onChange={e => set('company', e.target.value)}
              placeholder={t('prospects.companyPlaceholder')} className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.campaignLabel')}</label>
            <select required value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)} className="z-input">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('prospects.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary">
              {loading ? t('prospects.adding') : t('prospects.addProspect')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProspectHistoryModal({ prospect, onClose }) {
  const { t } = useTranslation()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCall, setSelectedCall] = useState(null)

  useEffect(() => {
    getCalls({ prospect_id: prospect.id })
      .then(setCalls)
      .catch(() => setCalls([]))
      .finally(() => setLoading(false))
  }, [prospect.id])

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-z-border">
            <div>
              <h2 className="text-lg font-bold text-slate-100">{t('prospects.history')}</h2>
              <p className="text-sm text-slate-400">{prospect.name} · {prospect.phone}</p>
            </div>
            <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-black/20 sticky top-0">
                <tr>
                  {[t('prospects.historyHeaders.date'), t('prospects.historyHeaders.duration'), t('prospects.historyHeaders.result'), t('prospects.historyHeaders.sentiment'), ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('prospects.loading')}</td></tr>
                ) : calls.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">{t('prospects.noHistory')}</td></tr>
                ) : calls.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelectedCall(c)}>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(c.started_at)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.duration_seconds ? (c.duration_seconds >= 60 ? `${Math.floor(c.duration_seconds/60)}m ${c.duration_seconds%60}s` : `${c.duration_seconds}s`) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.outcome || c.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{c.sentiment || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setSelectedCall(c) }} className="text-xs text-z-blue-light hover:underline">{t('prospects.view')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </>
  )
}

export default function Prospects() {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org') ? Number(searchParams.get('org')) : null
  const orgName = searchParams.get('orgName') || ''
  const [prospects, setProspects] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [callingId, setCallingId] = useState(null)
  const [historyProspect, setHistoryProspect] = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isFree = user.plan === 'free' || user.plan === 'starter'
  const [demoStatus, setDemoStatus] = useState(null)

  const handleCall = async (p) => {
    if (callingId) return
    setCallingId(p.id)
    try { await callProspect(p.id); load() }
    catch (err) { alert(t('prospects.genericError') + ': ' + (err.response?.data?.detail || err.message)) }
    finally { setCallingId(null) }
  }

  const load = () => {
    const params = {}
    if (filterCampaign === 'email_only') params.email_only = true
    else if (filterCampaign) params.campaign_id = filterCampaign
    if (filterStatus) params.status = filterStatus
    if (orgId) params.organization_id = orgId
    getProspects(params).then(setProspects).catch(() => {})
  }

  useEffect(() => {
    getCampaigns(orgId ? { organization_id: orgId } : undefined).then(setCampaigns).catch(() => {})
    if (isFree) getDemoStatus().then(setDemoStatus).catch(() => {})
  }, [orgId])
  useEffect(() => { load() }, [filterCampaign, filterStatus, orgId])

  const handleDelete = async (p) => {
    if (!confirm(t('prospects.confirmDelete', { name: p.name }))) return
    try { await deleteProspect(p.id); load() }
    catch (err) { alert(err.response?.data?.detail || t('prospects.genericError')) }
  }

  const handleRetry = async () => {
    const label = filterStatus
      ? t('prospects.scopeStatus', { count: prospects.length, status: filterStatus })
      : t('prospects.scopeFailedVoicemail')
    if (!confirm(t('prospects.retryConfirm', { label }))) return
    try {
      const params = {}
      if (filterCampaign === 'email_only') params.email_only = true
      else if (filterCampaign) params.campaign_id = filterCampaign
      if (filterStatus) params.status = filterStatus
      const res = await retryProspects(params)
      alert(t('prospects.resetCount', { count: res.reset }))
      load()
    } catch (err) { alert(err.response?.data?.detail || t('prospects.genericError')) }
  }

  const handleDeleteAll = async () => {
    const scope = filterCampaign === 'email_only'
      ? t('prospects.scopeEmail', { count: prospects.length })
      : filterCampaign
        ? t('prospects.scopeCampaign', { count: prospects.length })
        : t('prospects.scopeAll', { count: prospects.length })
    if (!confirm(t('prospects.deleteAllConfirm', { scope }))) return
    try {
      const params = filterCampaign === 'email_only'
        ? { email_only: true }
        : filterCampaign ? { campaign_id: filterCampaign } : {}
      const res = await deleteAllProspects(params)
      alert(t('prospects.deleteCount', { count: res.deleted }))
      load()
    } catch (err) { alert(err.response?.data?.detail || t('prospects.genericError')) }
  }

  const handleExportCsv = () => {
    exportToCsv(`prospectos-${Date.now()}.csv`, prospects, [
      { key: 'name', label: t('prospects.headers.name') },
      { key: 'company', label: t('prospects.headers.company') },
      { key: 'phone', label: t('prospects.headers.phone') },
      { key: 'status', label: t('prospects.headers.status') },
      { key: 'call_attempts', label: t('prospects.headers.attempts') },
    ])
  }

  const campaignName = (id) => {
    if (id == null) return null
    return campaigns.find(c => c.id === id)?.name || `#${id}`
  }
  const noCampaigns = campaigns.length === 0

  return (
    <div className="p-6 space-y-6">
      <OrgScopeBanner orgId={orgId} orgName={orgName} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('prospects.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('prospects.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {prospects.length > 0 && (
            <button onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 bg-z-card border border-z-border hover:bg-white/5 text-slate-300 text-sm rounded-lg transition-colors">
              <ArrowDownTrayIcon className="w-4 h-4" /> {t('prospects.exportCsv')}
            </button>
          )}
          {!isFree && (
            <>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 border border-z-blue text-z-blue-light hover:bg-z-blue/10 font-semibold rounded-lg text-sm transition-colors">
              <PlusIcon className="w-4 h-4" /> {t('prospects.new')}
            </button>
            <button onClick={() => setShowImport(true)} className="z-btn-primary flex items-center gap-2">
              <ArrowUpTrayIcon className="w-4 h-4" /> {t('prospects.import')}
            </button>
            </>
          )}
        </div>
      </div>

      {isFree && (
        <UpgradeBanner compact demosUsed={demoStatus?.demo_calls_used ?? 0} />
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-full sm:w-auto">
          <option value="">{t('prospects.allCampaigns')}</option>
          <option value="email_only">{t('prospects.emailContacts')}</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="z-input w-full sm:w-auto">
          {STATUSES.map(s => <option key={s} value={s}>{s ? t(`status.${s}`) : t('prospects.allStatuses')}</option>)}
        </select>
        <span className="text-sm text-slate-500">{t('prospects.prospectsCount', { count: prospects.length })}</span>
        {prospects.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-z-blue-light border border-z-blue/30 hover:bg-z-blue/10 rounded-lg transition-colors">
              <ArrowPathIcon className="w-3.5 h-3.5" />
              {filterStatus ? t('prospects.retryStatus', { status: filterStatus }) : t('prospects.retryFailed')}
            </button>
            <button onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">
              <TrashIcon className="w-3.5 h-3.5" />
              {filterCampaign ? t('prospects.deleteCampaign') : t('prospects.deleteAll')}
            </button>
          </div>
        )}
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-black/20">
            <tr>
              {[t('prospects.headers.name'), t('prospects.headers.company'), t('prospects.headers.phone'), t('prospects.scoreHeader'), t('prospects.headers.campaign'), t('prospects.headers.status'), t('prospects.headers.attempts'), t('prospects.headers.lastCall'), t('prospects.emailHeader'), t('prospects.headers.actions')].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {prospects.map(p => (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="px-6 py-3 font-medium text-slate-200">{p.name}</td>
                <td className="px-6 py-3 text-slate-400">{p.company || '—'}</td>
                <td className="px-6 py-3 text-slate-300 font-mono text-xs">{p.phone}</td>
                <td className="px-6 py-3">
                  {p.quality_score != null ? (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold ${p.quality_score >= 75 ? 'bg-green-500/20 text-green-300' : p.quality_score >= 50 ? 'bg-yellow-500/20 text-yellow-300' : 'bg-slate-500/20 text-slate-400'}`}>
                      {p.quality_score}
                    </span>
                  ) : <span className="text-slate-600 text-xs">—</span>}
                </td>
                <td className="px-6 py-3 text-slate-400 text-xs">
                  {p.campaign_id == null
                    ? <span className="px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 text-xs font-medium">{t('prospects.emailHeader')}</span>
                    : campaignName(p.campaign_id)}
                </td>
                <td className="px-6 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3 text-slate-400">{p.call_attempts}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {fmtDate(p.last_called_at)}
                </td>
                <td className="px-6 py-3">
                  {p.email_unsubscribed ? (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-600" title={t('prospects.unsubscribedTitle')}>
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" /> {t('prospects.unsubscribedShort')}
                    </span>
                  ) : p.last_email_sent_at ? (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-400" title={t('prospects.emailSentTooltip', { count: p.email_send_count || 1, date: fmtDate(p.last_email_sent_at) })}>
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
                      {fmtDate(p.last_email_sent_at)}
                    </span>
                  ) : p.email ? (
                    <span className="text-xs text-slate-600">—</span>
                  ) : (
                    <span className="text-xs text-slate-700 italic">{t('prospects.noEmail')}</span>
                  )}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleCall(p)} disabled={callingId === p.id}
                      className="text-slate-600 hover:text-z-blue-light transition-colors disabled:opacity-40" title={t('prospects.callTitle')}>
                      <PhoneArrowUpRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setHistoryProspect(p)} className="text-slate-600 hover:text-slate-300 transition-colors" title={t('prospects.historyTitle')}>
                      <ClockIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-slate-600 hover:text-red-400 transition-colors" title={t('prospects.deleteTitle')}>
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={10} className="px-6 py-12 text-center">
                <UsersIcon className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-40" />
                <p className="text-slate-500 text-sm">{t('prospects.noProspects')}</p>
              </td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">{t('prospects.noCampaignWarning')}</p>
                <button onClick={() => setShowNew(false)} className="z-btn-primary">{t('prospects.close')}</button>
              </div>
            </div>
          : <NewProspectModal campaigns={campaigns} onClose={() => setShowNew(false)}
              onSaved={() => { setShowNew(false); load() }} />
      )}

      {showImport && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">{t('prospects.noCampaignImportWarning')}</p>
                <button onClick={() => setShowImport(false)} className="z-btn-primary">{t('prospects.close')}</button>
              </div>
            </div>
          : <ImportCSVModal campaigns={campaigns} onClose={() => setShowImport(false)}
              onImported={() => { setShowImport(false); load() }} />
      )}

      {historyProspect && (
        <ProspectHistoryModal prospect={historyProspect} onClose={() => setHistoryProspect(null)} />
      )}
    </div>
  )
}
