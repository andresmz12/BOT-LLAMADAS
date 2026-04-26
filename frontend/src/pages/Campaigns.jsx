import { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, PauseIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import StatusBadge from '../components/StatusBadge'
import UpgradeBanner from '../components/UpgradeBanner'
import { getCampaigns, createCampaign, startCampaign, pauseCampaign, deleteCampaign, getAgents, getDemoStatus } from '../api/client'

export default function Campaigns() {
  const { t } = useTranslation()
  const [campaigns, setCampaigns] = useState([])
  const [agents, setAgents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isFree = user.plan === 'free'
  const [demoStatus, setDemoStatus] = useState(null)

  const load = () => getCampaigns().then(setCampaigns).catch(() => {})

  useEffect(() => {
    load()
    getAgents().then(setAgents).catch(() => {})
    if (isFree) getDemoStatus().then(setDemoStatus).catch(() => {})
  }, [])

  const handleStart = async (id) => {
    try { await startCampaign(id); load() }
    catch (err) { alert(err.response?.data?.detail || t('campaigns.error_start')) }
  }
  const handlePause = async (id) => {
    try { await pauseCampaign(id); load() }
    catch (err) { alert(err.response?.data?.detail || t('campaigns.error_pause')) }
  }
  const handleDelete = async (c) => {
    if (!confirm(t('campaigns.confirm_delete', { name: c.name }))) return
    try { await deleteCampaign(c.id); load() }
    catch (err) { alert(err.response?.data?.detail || t('campaigns.error_delete')) }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">{t('campaigns.title')}</h1>
        {!isFree && (
          <button onClick={() => setShowModal(true)} className="z-btn-primary flex items-center gap-2 self-start sm:self-auto">
            <PlusIcon className="w-4 h-4" /> {t('campaigns.new')}
          </button>
        )}
      </div>

      {isFree && (
        <UpgradeBanner compact demosUsed={demoStatus?.demo_calls_used ?? 0} />
      )}

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-black/20">
            <tr>
              {[t('campaigns.col_name'), t('campaigns.col_status'), t('campaigns.col_prospects'), t('campaigns.col_calls'), t('campaigns.col_interested'), t('campaigns.col_appointments'), t('campaigns.col_pace'), t('campaigns.col_actions')].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {campaigns.map(c => {
              const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
              return (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4">
                    <p className="font-medium text-slate-200">{c.name}</p>
                    {c.description && <p className="text-xs text-slate-500 mt-0.5">{c.description}</p>}
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} pulse /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-slate-800 rounded-full h-1.5">
                        <div className="bg-z-blue h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{c.completed_prospects}/{c.total_prospects}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{c.total_calls}</td>
                  <td className="px-6 py-4 text-slate-300">{c.interested}</td>
                  <td className="px-6 py-4 text-slate-300">{c.appointments_scheduled}</td>
                  <td className="px-6 py-4 text-slate-400 text-xs">
                    {c.sequential_calls
                      ? <span className="px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium">{t('campaigns.sequential')}</span>
                      : t('campaigns.per_min', { n: c.calls_per_minute ?? 10 })}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button onClick={() => handleStart(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium rounded-lg">
                          <PlayIcon className="w-3.5 h-3.5" /> {t('campaigns.start')}
                        </button>
                      )}
                      {c.status === 'running' && (
                        <button onClick={() => handlePause(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-medium rounded-lg">
                          <PauseIcon className="w-3.5 h-3.5" /> {t('campaigns.pause')}
                        </button>
                      )}
                      {c.status !== 'running' && (
                        <button onClick={() => handleDelete(c)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium rounded-lg">
                          <TrashIcon className="w-3.5 h-3.5" /> {t('campaigns.delete')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {campaigns.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">{t('campaigns.empty')}</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <NewCampaignModal agents={agents} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }} />
      )}
    </div>
  )
}

function NewCampaignModal({ agents, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState({ name: '', description: '', agent_config_id: agents[0]?.id || '', calls_per_minute: 10, sequential_calls: false })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (agents.length > 0 && !form.agent_config_id) {
      setForm(f => ({ ...f, agent_config_id: agents[0].id }))
    }
  }, [agents])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.agent_config_id) return alert(t('campaigns.select_agent'))
    setLoading(true)
    try {
      await createCampaign({ ...form, agent_config_id: Number(form.agent_config_id), calls_per_minute: Number(form.calls_per_minute), sequential_calls: form.sequential_calls })
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || t('campaigns.error_create'))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{t('campaigns.modal_title')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('campaigns.field_name')}</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="z-input" placeholder={t('campaigns.field_name_placeholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('campaigns.field_desc')}</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="z-input" placeholder={t('campaigns.field_desc_placeholder')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('campaigns.field_agent')}</label>
            <select value={form.agent_config_id} onChange={e => setForm(f => ({ ...f, agent_config_id: e.target.value }))}
              className="z-input">
              {agents.map(a => <option key={a.id} value={a.id}>{a.agent_name} — {a.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('campaigns.field_cpm')}</label>
            <input type="number" min="1" max="60" value={form.calls_per_minute}
              onChange={e => setForm(f => ({ ...f, calls_per_minute: e.target.value }))}
              className={`z-input ${form.sequential_calls ? 'opacity-40 pointer-events-none' : ''}`} />
            <p className="text-xs text-slate-500 mt-1">{t('campaigns.field_interval', { s: (60 / (form.calls_per_minute || 10)).toFixed(1) })}</p>
          </div>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-z-border hover:bg-white/[0.02] cursor-pointer">
            <input type="checkbox" checked={form.sequential_calls}
              onChange={e => setForm(f => ({ ...f, sequential_calls: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800 text-z-blue w-4 h-4 cursor-pointer" />
            <div>
              <p className="text-sm font-medium text-slate-200">{t('campaigns.field_sequential')}</p>
              <p className="text-xs text-slate-500">{t('campaigns.field_sequential_desc')}</p>
            </div>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary">
              {loading ? t('campaigns.creating') : t('campaigns.create_btn')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
