import { useState, useEffect } from 'react'
import { ArrowUpTrayIcon, TrashIcon, PlusIcon, XMarkIcon, PhoneArrowUpRightIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import ImportCSVModal from '../components/ImportCSVModal'
import { getProspects, deleteProspect, getCampaigns, createProspect, callProspect } from '../api/client'

const STATUSES = ['', 'pending', 'calling', 'answered', 'voicemail', 'failed', 'do_not_call']

function NewProspectModal({ campaigns, onClose, onSaved }) {
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <h2 className="text-lg font-bold text-zyra-text">Nuevo Prospecto</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Nombre *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Juan Pérez"
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Teléfono *</label>
            <input required value={form.phone} onChange={e => set('phone', e.target.value)}
              placeholder="+521234567890"
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue font-mono" />
            <p className="text-xs text-zyra-muted mt-1">Formato E.164 con código de país</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Empresa</label>
            <input value={form.company} onChange={e => set('company', e.target.value)}
              placeholder="Empresa S.A."
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue" />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Campaña *</label>
            <select required value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zyra-muted hover:text-zyra-text">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Prospects() {
  const [prospects, setProspects] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [callingId, setCallingId] = useState(null)

  const handleCall = async (p) => {
    if (callingId) return
    setCallingId(p.id)
    try {
      await callProspect(p.id)
      load()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
      setCallingId(null)
    }
  }

  const load = () => {
    const params = {}
    if (filterCampaign) params.campaign_id = filterCampaign
    if (filterStatus) params.status = filterStatus
    getProspects(params).then(setProspects).catch(() => {})
  }

  useEffect(() => { getCampaigns().then(setCampaigns).catch(() => {}) }, [])
  useEffect(() => { load() }, [filterCampaign, filterStatus])

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar a "${p.name}"?`)) return
    try { await deleteProspect(p.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const campaignName = (id) => campaigns.find(c => c.id === id)?.name || `#${id}`
  const noCampaigns = campaigns.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zyra-text">Prospectos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 border border-zyra-blue text-zyra-blue hover:bg-zyra-blue/10 font-semibold rounded-lg text-sm"
          >
            <PlusIcon className="w-4 h-4" /> Nuevo prospecto
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm"
          >
            <ArrowUpTrayIcon className="w-4 h-4" /> Importar Excel / CSV
          </button>
        </div>
      </div>

      <div className="flex gap-3">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="bg-zyra-card border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
        >
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-zyra-card border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
        </select>
        <span className="ml-auto text-sm text-zyra-muted self-center">{prospects.length} prospectos</span>
      </div>

      <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F172A]">
            <tr>
              {['Nombre', 'Empresa', 'Teléfono', 'Campaña', 'Estado', 'Intentos', 'Última llamada', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zyra-muted uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zyra-border">
            {prospects.map(p => (
              <tr key={p.id} className="hover:bg-white/5">
                <td className="px-6 py-3 font-medium text-zyra-text">{p.name}</td>
                <td className="px-6 py-3 text-zyra-muted">{p.company || '—'}</td>
                <td className="px-6 py-3 text-zyra-text font-mono text-xs">{p.phone}</td>
                <td className="px-6 py-3 text-zyra-muted text-xs">{campaignName(p.campaign_id)}</td>
                <td className="px-6 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3 text-zyra-muted">{p.call_attempts}</td>
                <td className="px-6 py-3 text-zyra-muted text-xs">
                  {p.last_called_at ? new Date(p.last_called_at).toLocaleString() : '—'}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleCall(p)}
                      disabled={callingId === p.id}
                      title="Llamar ahora"
                      className="text-zyra-muted hover:text-zyra-blue transition-colors disabled:opacity-40"
                    >
                      <PhoneArrowUpRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-zyra-muted hover:text-red-400 transition-colors">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-zyra-muted">No hay prospectos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showNew && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-zyra-card border border-zyra-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-zyra-text mb-4">Debes crear una campaña antes de agregar prospectos.</p>
                <button onClick={() => setShowNew(false)} className="px-4 py-2 bg-zyra-blue text-white rounded-lg text-sm font-semibold">Cerrar</button>
              </div>
            </div>
          : <NewProspectModal campaigns={campaigns} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load() }} />
      )}

      {showImport && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-zyra-card border border-zyra-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-zyra-text mb-4">Debes crear una campaña antes de importar prospectos.</p>
                <button onClick={() => setShowImport(false)} className="px-4 py-2 bg-zyra-blue text-white rounded-lg text-sm font-semibold">Cerrar</button>
              </div>
            </div>
          : <ImportCSVModal campaigns={campaigns} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load() }} />
      )}
    </div>
  )
}
