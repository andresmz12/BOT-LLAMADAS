import { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, PauseIcon, TrashIcon } from '@heroicons/react/24/outline'
import { XMarkIcon } from '@heroicons/react/24/outline'
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
        <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm"
        >
          <PlusIcon className="w-4 h-4" /> Nueva Campaña
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Estado', 'Prospectos', 'Llamadas', 'Interesados', 'Citas', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map(c => {
              const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
              return (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="font-medium text-gray-900">{c.name}</p>
                    {c.description && <p className="text-xs text-gray-400 mt-0.5">{c.description}</p>}
                  </td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} pulse /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-gold h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{c.completed_prospects}/{c.total_prospects}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{c.total_calls}</td>
                  <td className="px-6 py-4 text-gray-700">{c.interested}</td>
                  <td className="px-6 py-4 text-gray-700">{c.appointments_scheduled}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {(c.status === 'draft' || c.status === 'paused') && (
                        <button
                          onClick={() => handleStart(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg"
                        >
                          <PlayIcon className="w-3.5 h-3.5" /> Iniciar
                        </button>
                      )}
                      {c.status === 'running' && (
                        <button
                          onClick={() => handlePause(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-yellow-50 hover:bg-yellow-100 text-yellow-700 text-xs font-medium rounded-lg"
                        >
                          <PauseIcon className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {c.status === 'draft' && (
                        <button
                          onClick={() => handleDelete(c)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded-lg"
                        >
                          <TrashIcon className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {campaigns.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No hay campañas creadas</td></tr>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">Nueva Campaña</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              required
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="Campaña Enero 2025"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción (opcional)</label>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold"
              placeholder="Descripción breve"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agente</label>
            <select
              value={form.agent_config_id}
              onChange={e => setForm(f => ({ ...f, agent_config_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
            >
              {agents.map(a => <option key={a.id} value={a.id}>{a.agent_name} — {a.company_name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Creando...' : 'Crear campaña'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
