import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, StarIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { getAgents, deleteAgent, setDefaultAgent } from '../api/client'
import AgentFormModal from '../components/AgentFormModal'

export default function Agents() {
  const [agents, setAgents] = useState([])
  const [modal, setModal] = useState(null)

  const load = () => getAgents().then(setAgents).catch(() => {})
  useEffect(() => { load() }, [])

  const handleDelete = async (agent) => {
    if (!confirm(`¿Eliminar "${agent.name}"?`)) return
    try { await deleteAgent(agent.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Agentes de Voz</h1>
        <button onClick={() => setModal('new')}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm">
          <PlusIcon className="w-4 h-4" /> Nuevo Agente
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">{agent.agent_name}</h3>
                  {agent.is_default && <span className="px-1.5 py-0.5 bg-gold/15 text-yellow-700 text-xs font-semibold rounded-full">Default</span>}
                </div>
                <p className="text-sm text-gray-500">{agent.company_name}</p>
              </div>
              <button onClick={() => setDefaultAgent(agent.id).then(load)} className="text-gray-300 hover:text-gold">
                {agent.is_default ? <StarSolid className="w-5 h-5 text-gold" /> : <StarIcon className="w-5 h-5" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              <span className="bg-gray-100 px-2 py-0.5 rounded-full">{agent.language}</span> • max {agent.max_call_duration}s
            </p>
            <div className="flex gap-2">
              <button onClick={() => setModal(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg">
                <PencilIcon className="w-3.5 h-3.5" /> Editar
              </button>
              <button onClick={() => handleDelete(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 border border-red-100 rounded-lg">
                <TrashIcon className="w-3.5 h-3.5" /> Eliminar
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && <div className="col-span-3 text-center py-16 text-gray-400">No hay agentes configurados</div>}
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
