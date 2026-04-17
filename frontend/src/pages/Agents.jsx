import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, StarIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, PhoneArrowDownLeftIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { getAgents, deleteAgent, setDefaultAgent, syncAgent } from '../api/client'
import AgentFormModal from '../components/AgentFormModal'

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [modal, setModal] = useState(null)
  const [syncingId, setSyncingId] = useState(null)

  const load = () => getAgents().then(setAgents).catch(() => {})
  useEffect(() => { load() }, [])

  const handleDelete = async (agent) => {
    if (!confirm(`¿Eliminar "${agent.name}"?`)) return
    try { await deleteAgent(agent.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleSync = async (agent) => {
    if (syncingId) return
    setSyncingId(agent.id)
    try {
      const resp = await syncAgent(agent.id)
      if (resp.retell_error) alert('Error al sincronizar con Retell: ' + resp.retell_error)
      load()
    } catch (err) {
      alert('Error al sincronizar: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zyra-text">Agentes de Voz</h1>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm">
          <PlusIcon className="w-4 h-4" /> Nuevo Agente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.id} className="bg-zyra-card rounded-xl p-5 border border-zyra-border">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-zyra-text">{agent.agent_name}</h3>
                  {agent.is_default && (
                    <span className="px-1.5 py-0.5 bg-zyra-blue/20 text-blue-300 text-xs font-semibold rounded-full">Default</span>
                  )}
                  {agent.retell_agent_id ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-900/40 text-green-400 text-xs font-semibold rounded-full">
                      <CheckCircleIcon className="w-3 h-3" /> Sincronizado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-900/40 text-amber-400 text-xs font-semibold rounded-full">
                      <ExclamationTriangleIcon className="w-3 h-3" /> Sin sincronizar
                    </span>
                  )}
                  {agent.inbound_enabled && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-900/40 text-blue-400 text-xs font-semibold rounded-full">
                      <PhoneArrowDownLeftIcon className="w-3 h-3" /> Entrante activo
                    </span>
                  )}
                </div>
                <p className="text-sm text-zyra-muted">{agent.company_name}</p>
              </div>
              <button onClick={() => setDefaultAgent(agent.id).then(load)} className="text-zyra-muted hover:text-zyra-blue ml-2 flex-shrink-0">
                {agent.is_default ? <StarSolid className="w-5 h-5 text-zyra-blue" /> : <StarIcon className="w-5 h-5" />}
              </button>
            </div>

            <p className="text-xs text-zyra-muted mb-4">
              <span className="bg-white/10 px-2 py-0.5 rounded-full">{agent.language}</span>
              {' • '}
              <span className="bg-white/10 px-2 py-0.5 rounded-full">{agent.voice_id || 'retell-Andrea'}</span>
              {' • '}max {agent.max_call_duration}s
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleSync(agent)}
                disabled={syncingId === agent.id}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-800/50 rounded-lg hover:bg-blue-900/30 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${syncingId === agent.id ? 'animate-spin' : ''}`} />
                {syncingId === agent.id ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button onClick={() => setModal(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-zyra-muted border border-zyra-border rounded-lg hover:bg-white/5">
                <PencilIcon className="w-3.5 h-3.5" /> Editar
              </button>
              <button onClick={() => handleDelete(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/40 rounded-lg hover:bg-red-900/20">
                <TrashIcon className="w-3.5 h-3.5" /> Eliminar
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="col-span-3 text-center py-16 text-zyra-muted">No hay agentes configurados</div>
        )}
      </div>

      {modal && (
        <AgentFormModal
          agent={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}
