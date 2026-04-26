import { useState, useEffect } from 'react'
import { ArrowUpTrayIcon, TrashIcon, PlusIcon, XMarkIcon, PhoneArrowUpRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../components/StatusBadge'
import ImportCSVModal from '../components/ImportCSVModal'
import UpgradeBanner from '../components/UpgradeBanner'
import { getProspects, deleteProspect, deleteAllProspects, retryProspects, getCampaigns, createProspect, callProspect, getDemoStatus } from '../api/client'
import { fmtDate } from '../utils/date'

const STATUSES = ['', 'pending', 'calling', 'answered', 'voicemail', 'failed', 'do_not_call']

function NewProspectModal({ campaigns, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', phone: '', company: '', campaign_id: campaigns[0]?.id || '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await createProspect({ ...form, campaign_id: Number(form.campaign_id) })
      onSaved()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{t('prospects.modal_title')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.field_name')}</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Juan Pérez" className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.field_phone')}</label>
            <input required value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="+521234567890" className="z-input font-mono" />
            <p className="text-xs text-slate-500 mt-1">{t('prospects.field_phone_hint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.field_company')}</label>
            <input value={form.company} onChange={e => set('company', e.target.value)}
              placeholder="Empresa S.A." className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('prospects.field_campaign')}</label>
            <select required value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)} className="z-input">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary">
              {loading ? t('prospects.saving') : t('prospects.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Prospects() {
  const { t } = useTranslation()
  const [prospects, setProspects] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [callingId, setCallingId] = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isFree = user.plan === 'free'
  const [demoStatus, setDemoStatus] = useState(null)

  const handleCall = async (p) => {
    if (callingId) return
    setCallingId(p.id)
    try { await callProspect(p.id); load() }
    catch (err) { alert('Error: ' + (err.response?.data?.detail || err.message)) }
    finally { setCallingId(null) }
  }

  const load = () => {
    const params = {}
    if (filterCampaign) params.campaign_id = filterCampaign
    if (filterStatus) params.status = filterStatus
    getProspects(params).then(setProspects).catch(() => {})
  }

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(() => {})
    if (isFree) getDemoStatus().then(setDemoStatus).catch(() => {})
  }, [])
  useEffect(() => { load() }, [filterCampaign, filterStatus])

  const handleDelete = async (p) => {
    if (!confirm(t('prospects.confirm_delete', { name: p.name }))) return
    try { await deleteProspect(p.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleRetry = async () => {
    const label = filterStatus
      ? t('prospects.retry_filter', { status: filterStatus })
      : t('prospects.retry_default')
    if (!confirm(t('prospects.confirm_retry', { label }))) return
    try {
      const params = {}
      if (filterCampaign) params.campaign_id = filterCampaign
      if (filterStatus) params.status = filterStatus
      const res = await retryProspects(params)
      alert(t('prospects.reset_msg', { n: res.reset }))
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleDeleteAll = async () => {
    const scope = filterCampaign
      ? t('prospects.scope_campaign', { n: prospects.length })
      : t('prospects.scope_all', { n: prospects.length })
    if (!confirm(t('prospects.confirm_delete_all', { scope }))) return
    try {
      const params = filterCampaign ? { campaign_id: filterCampaign } : {}
      const res = await deleteAllProspects(params)
      alert(t('prospects.deleted_msg', { n: res.deleted }))
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const campaignName = (id) => campaigns.find(c => c.id === id)?.name || `#${id}`
  const noCampaigns = campaigns.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">{t('prospects.title')}</h1>
        {!isFree && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 border border-z-blue text-z-blue-light hover:bg-z-blue/10 font-semibold rounded-lg text-sm transition-colors">
              <PlusIcon className="w-4 h-4" /> {t('prospects.new')}
            </button>
            <button onClick={() => setShowImport(true)} className="z-btn-primary flex items-center gap-2">
              <ArrowUpTrayIcon className="w-4 h-4" /> {t('prospects.import')}
            </button>
          </div>
        )}
      </div>

      {isFree && (
        <UpgradeBanner compact demosUsed={demoStatus?.demo_calls_used ?? 0} />
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-full sm:w-auto">
          <option value="">{t('prospects.all_campaigns')}</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="z-input w-full sm:w-auto">
          {STATUSES.map(s => <option key={s} value={s}>{s || t('prospects.all_statuses')}</option>)}
        </select>
        <span className="text-sm text-slate-500">{t('prospects.count', { n: prospects.length })}</span>
        {prospects.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-z-blue-light border border-z-blue/30 hover:bg-z-blue/10 rounded-lg transition-colors">
              <ArrowPathIcon className="w-3.5 h-3.5" />
              {t('prospects.retry', { label: filterStatus ? `"${filterStatus}"` : t('prospects.retry_default') })}
            </button>
            <button onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">
              <TrashIcon className="w-3.5 h-3.5" />
              {filterCampaign ? t('prospects.delete_campaign') : t('prospects.delete_all')}
            </button>
          </div>
        )}
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-black/20">
            <tr>
              {[t('prospects.col_name'), t('prospects.col_company'), t('prospects.col_phone'), t('prospects.col_campaign'), t('prospects.col_status'), t('prospects.col_attempts'), t('prospects.col_last_call'), t('prospects.col_actions')].map(h => (
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
                <td className="px-6 py-3 text-slate-400 text-xs">{campaignName(p.campaign_id)}</td>
                <td className="px-6 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3 text-slate-400">{p.call_attempts}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">{fmtDate(p.last_called_at)}</td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleCall(p)} disabled={callingId === p.id}
                      className="text-slate-600 hover:text-z-blue-light transition-colors disabled:opacity-40">
                      <PhoneArrowUpRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-slate-600 hover:text-red-400 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">{t('prospects.empty')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">{t('prospects.no_campaigns_msg')}</p>
                <button onClick={() => setShowNew(false)} className="z-btn-primary">{t('common.close')}</button>
              </div>
            </div>
          : <NewProspectModal campaigns={campaigns} onClose={() => setShowNew(false)}
              onSaved={() => { setShowNew(false); load() }} />
      )}

      {showImport && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">{t('prospects.no_campaigns_msg')}</p>
                <button onClick={() => setShowImport(false)} className="z-btn-primary">{t('common.close')}</button>
              </div>
            </div>
          : <ImportCSVModal campaigns={campaigns} onClose={() => setShowImport(false)}
              onImported={() => { setShowImport(false); load() }} />
      )}
    </div>
  )
}
