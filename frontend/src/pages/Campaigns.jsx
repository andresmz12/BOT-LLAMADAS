import { useState, useEffect } from 'react'
import { PlusIcon, PlayIcon, PauseIcon, TrashIcon, XMarkIcon, PencilSquareIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import UpgradeBanner from '../components/UpgradeBanner'
import { getCampaigns, createCampaign, updateCampaign, startCampaign, pauseCampaign, deleteCampaign, getAgents, getDemoStatus } from '../api/client'

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([])
  const [agents, setAgents] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
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
    catch (err) { alert(err.response?.data?.detail || 'Error al iniciar') }
  }
  const handlePause = async (id) => {
    try { await pauseCampaign(id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al pausar') }
  }
  const handleDelete = async (c) => {
    const warning = c.status === 'running' ? '\n\n⚠ Esta campaña está en ejecución. Se detendrá y todos sus prospectos serán eliminados.' : ''
    if (!confirm(`¿Eliminar campaña "${c.name}"?${warning}`)) return
    try { await deleteCampaign(c.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al eliminar') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Campañas</h1>
        {!isFree && (
          <button onClick={() => setShowModal(true)} className="z-btn-primary flex items-center gap-2 self-start sm:self-auto">
            <PlusIcon className="w-4 h-4" /> Nueva Campaña
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
              {['Nombre', 'Estado', 'Prospectos', 'Llamadas', 'Interesados', 'Citas', 'Ritmo', 'Acciones'].map(h => (
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
                    {c.status === 'scheduled' && c.scheduled_start_at && (
                      <p className="text-xs text-orange-400 mt-0.5">
                        Inicia: {new Date(c.scheduled_start_at.endsWith('Z') ? c.scheduled_start_at : c.scheduled_start_at + 'Z').toLocaleString()}
                      </p>
                    )}
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
                      ? <span className="px-2 py-0.5 bg-purple-500/15 text-purple-400 rounded-full font-medium">Secuencial</span>
                      : `${c.calls_per_minute ?? 10}/min`}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {(c.status === 'draft' || c.status === 'paused' || c.status === 'scheduled') && (
                        <button onClick={() => handleStart(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium rounded-lg">
                          <PlayIcon className="w-3.5 h-3.5" /> Iniciar
                        </button>
                      )}
                      {c.status === 'running' && (
                        <button onClick={() => handlePause(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-yellow-500/15 hover:bg-yellow-500/25 text-yellow-400 text-xs font-medium rounded-lg">
                          <PauseIcon className="w-3.5 h-3.5" /> Pausar
                        </button>
                      )}
                      {c.status !== 'running' && (
                        <button onClick={() => setEditing(c)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 text-xs font-medium rounded-lg">
                          <PencilSquareIcon className="w-3.5 h-3.5" /> Editar
                        </button>
                      )}
                      <button onClick={() => handleDelete(c)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-red-500/15 hover:bg-red-500/25 text-red-400 text-xs font-medium rounded-lg">
                        <TrashIcon className="w-3.5 h-3.5" /> Eliminar
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {campaigns.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No hay campañas creadas</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showModal && (
        <CampaignModal agents={agents} onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load() }} />
      )}
      {editing && (
        <CampaignModal agents={agents} campaign={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function toLocalDatetimeInput(iso) {
  if (!iso) return ''
  const s = iso.endsWith('Z') ? iso : iso + 'Z'
  const d = new Date(s)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CampaignModal({ agents, campaign, onClose, onSaved }) {
  const isEdit = !!campaign
  const [form, setForm] = useState(() => isEdit ? {
    name: campaign.name || '',
    description: campaign.description || '',
    agent_config_id: campaign.agent_config_id || agents[0]?.id || '',
    calls_per_minute: campaign.calls_per_minute ?? 10,
    sequential_calls: !!campaign.sequential_calls,
    schedule_enabled: !!campaign.scheduled_start_at,
    scheduled_start_at: toLocalDatetimeInput(campaign.scheduled_start_at),
  } : { name: '', description: '', agent_config_id: agents[0]?.id || '', calls_per_minute: 10, sequential_calls: false, schedule_enabled: false, scheduled_start_at: '' })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isEdit && agents.length > 0 && !form.agent_config_id) {
      setForm(f => ({ ...f, agent_config_id: agents[0].id }))
    }
  }, [agents])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.agent_config_id) return alert('Selecciona un agente')
    setLoading(true)
    try {
      if (isEdit) {
        const payload = {
          name: form.name,
          description: form.description,
          agent_config_id: Number(form.agent_config_id),
          calls_per_minute: Number(form.calls_per_minute),
          sequential_calls: form.sequential_calls,
        }
        if (form.schedule_enabled && form.scheduled_start_at) {
          payload.scheduled_start_at = new Date(form.scheduled_start_at).toISOString()
          payload.clear_schedule = false
        } else {
          payload.clear_schedule = true
        }
        await updateCampaign(campaign.id, payload)
      } else {
        const payload = {
          ...form,
          agent_config_id: Number(form.agent_config_id),
          calls_per_minute: Number(form.calls_per_minute),
          sequential_calls: form.sequential_calls,
          scheduled_start_at: form.schedule_enabled && form.scheduled_start_at
            ? new Date(form.scheduled_start_at).toISOString()
            : null,
        }
        delete payload.schedule_enabled
        await createCampaign(payload)
      }
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || (isEdit ? 'Error al actualizar campaña' : 'Error al crear campaña'))
    } finally { setLoading(false) }
  }

  // Minimum datetime for the picker: now + 1 min
  const minDatetime = new Date(Date.now() + 60000).toISOString().slice(0, 16)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{isEdit ? 'Editar Campaña' : 'Nueva Campaña'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="z-input" placeholder="Campaña Enero 2025" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Descripción (opcional)</label>
            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="z-input" placeholder="Descripción breve" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Agente</label>
            <select value={form.agent_config_id} onChange={e => setForm(f => ({ ...f, agent_config_id: e.target.value }))}
              className="z-input">
              {agents.map(a => <option key={a.id} value={a.id}>{a.agent_name} — {a.company_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Llamadas por minuto</label>
            <input type="number" min="1" max="60" value={form.calls_per_minute}
              onChange={e => setForm(f => ({ ...f, calls_per_minute: e.target.value }))}
              className={`z-input ${form.sequential_calls ? 'opacity-40 pointer-events-none' : ''}`} />
            <p className="text-xs text-slate-500 mt-1">Intervalo entre llamadas: {(60 / (form.calls_per_minute || 10)).toFixed(1)}s</p>
          </div>
          <label className="flex items-center gap-3 p-3 rounded-lg border border-z-border hover:bg-white/[0.02] cursor-pointer">
            <input type="checkbox" checked={form.sequential_calls}
              onChange={e => setForm(f => ({ ...f, sequential_calls: e.target.checked }))}
              className="rounded border-slate-600 bg-slate-800 text-z-blue w-4 h-4 cursor-pointer" />
            <div>
              <p className="text-sm font-medium text-slate-200">Llamadas secuenciales</p>
              <p className="text-xs text-slate-500">Esperar a que cada llamada termine antes de iniciar la siguiente</p>
            </div>
          </label>

          <div className="border-t border-z-border pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.schedule_enabled}
                onChange={e => setForm(f => ({ ...f, schedule_enabled: e.target.checked, scheduled_start_at: '' }))}
                className="rounded border-slate-600 bg-slate-800 text-orange-500 w-4 h-4 cursor-pointer" />
              <div>
                <p className="text-sm font-medium text-slate-200">Programar inicio automático</p>
                <p className="text-xs text-slate-500">La campaña arrancará sola en la fecha y hora que elijas</p>
              </div>
            </label>
            {form.schedule_enabled && (
              <div className="mt-3">
                <label className="block text-sm font-medium text-slate-300 mb-1">Fecha y hora de inicio</label>
                <input
                  type="datetime-local"
                  required={form.schedule_enabled}
                  min={minDatetime}
                  value={form.scheduled_start_at}
                  onChange={e => setForm(f => ({ ...f, scheduled_start_at: e.target.value }))}
                  className="z-input"
                />
                <p className="text-xs text-slate-500 mt-1">Hora en tu zona horaria local</p>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="z-btn-primary">
              {loading ? 'Guardando...' : isEdit ? 'Guardar cambios' : (form.schedule_enabled ? 'Programar campaña' : 'Crear campaña')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
