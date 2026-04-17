import { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, PauseIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import { getCampaigns, createCampaign, startCampaign, pauseCampaign, deleteCampaign, getAgents } from '../api/client'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [agents, setAgents] = useState([])
  const [showModal, setShowModal] = useState(false)

  const load = () => getCampaigns().then(setCampaigns).catch(() => {})

  useEffect(() => {
    load()
    getAgents().then(setAgents).catch(() => {})
  }, [])

  const handleStart = async (id) => {
    try { await startCampaign(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al iniciar') }
  }

  const handlePause = async (id) => {
    try { await pauseCampaign(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al pausar') }
  }

  const handleDelete = async (c) => {
    if (!confirm(`¿Eliminar campaña "${c.name}"?`)) return
    try { await deleteCampaign(c.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al eliminar') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zyra-text">Campañas</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm"
        >
          <PlusIcon className="w-4 h-4" /> Nueva Campaña
        </button>
      </div>

      <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F172A]">
            <tr>
              {['Nombre', 'Estado', 'Prospectos', 'Llamadas', 'Interesados', 'Citas', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zyra-muted uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zyra-border">
            {campaigns.map(c => {
              const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
              return (
                <tr key={c.id} className="hover:bg-white/5">
                  <td className="px-6 py-4">
                    <p className="font-medium text-zyra-text">{c.name}</p>
                    {c.description && <p className="text-xs text-zyra-muted mt-0.5">{c.description}</p>}
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} pulse /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-zyra-border rounded-full h-1.5">
                        <div className="bg-zyra-blue h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-zyra-muted">{c.completed_prospects}/{c.total_prospects}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-zyra-text">{c.total_calls}</td>
                  <td className="px-6 py-4 text-zyra-text">{c.interested}</td>
                  <td className="px-6 py-4 text-zyra-text">{c.appointments_scheduled}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button onClick={() => handleStart(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-900/40 hover:bg-green-900/60 text-green-400 text-xs font-medium rounded-lg">
                          <PlayIcon className="w-3.5 h-3.5" /> Iniciar
                        </button>
                      )}
                      {c.status === 'running' && (
                        <button onClick={() => handlePause(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-yellow-900/40 hover:bg-yellow-900/60 text-yellow-400 text-xs font-medium rounded-lg">
                          <PauseIcon className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {c.status === 'draft' && (
                        <button onClick={() => handleDelete(c)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-400 text-xs font-medium rounded-lg">
                          <TrashIcon className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {campaigns.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-zyra-muted">No hay campañas creadas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <NewCampaignModal
          agents={agents}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }}
        />
      )}
    </div>
  )
}

function NewCampaignModal({ agents, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', description: '', agent_config_id: agents[0]?.id || '' })
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!form.agent_config_id) return alert('Selecciona un agente')
    setLoading(true)
    try {
      await createCampaign({ ...form, agent_config_id: Number(form.agent_config_id) })
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al crear campaña')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <h2 className="text-lg font-bold text-zyra-text">Nueva Campaña</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Nombre</label>
            <input
              required value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
              placeholder="Campaña Enero 2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Descripción (opcional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
              placeholder="Descripción breve"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Agente</label>
            <select
              value={form.agent_config_id}
              onChange={e => setForm(f => ({ ...f, agent_config_id: e.target.value }))}
              className="w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
            >
              {agents.map(a => <option key={a.id} value={a.id}>{a.agent_name} — {a.company_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zyra-muted hover:text-zyra-text">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Creando...' : 'Crear campaña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
