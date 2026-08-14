import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PlusIcon, PencilIcon, TrashIcon, StarIcon, ArrowPathIcon, CheckCircleIcon, ExclamationTriangleIcon, PhoneArrowDownLeftIcon, DocumentDuplicateIcon, UserGroupIcon, PhoneIcon } from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'
import { getAgents, deleteAgent, setDefaultAgent, syncAgent } from '../api/client'
import AgentFormModal from '../components/AgentFormModal'
import OrgScopeBanner from '../components/OrgScopeBanner'

export default function Agents() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const orgId = searchParams.get('org') ? Number(searchParams.get('org')) : null
  const orgName = searchParams.get('orgName') || ''
  const [agents, setAgents] = useState([])
  const [modal, setModal] = useState(null)
  const [syncingId, setSyncingId] = useState(null)

  const load = () => getAgents(orgId ? { organization_id: orgId } : undefined).then(setAgents).catch(() => {})
  useEffect(() => { load() }, [orgId])

  const handleDelete = async (agent) => {
    if (!confirm(`¿Eliminar "${agent.agent_name}"?`)) return
    try { await deleteAgent(agent.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleDuplicate = (agent) => {
    const { id, retell_agent_id, retell_llm_id, inbound_retell_agent_id, inbound_retell_llm_id, is_default, ...rest } = agent
    setModal({ ...rest, agent_name: `Copia de ${agent.agent_name}`, name: `Copia de ${agent.name}` })
  }

  const handleSync = async (agent) => {
    if (syncingId) return
    setSyncingId(agent.id)
    try {
      const resp = await syncAgent(agent.id)
      if (resp.retell_error) {
        alert('Error al sincronizar: ' + resp.retell_error)
      }
      load()
    } catch (err) {
      alert('Error al sincronizar: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSyncingId(null)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <OrgScopeBanner orgId={orgId} orgName={orgName} />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Agentes de Voz</h1>
          <p className="text-sm text-slate-500 mt-0.5">Configura y sincroniza los agentes de IA que hacen tus llamadas</p>
        </div>
        <button onClick={() => setModal('new')} className="z-btn-primary flex items-center gap-2 self-start sm:self-auto">
          <PlusIcon className="w-4 h-4" /> Nuevo Agente
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map(agent => (
          <div key={agent.id} className="bg-z-card rounded-xl p-5 border border-z-border">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-100">{agent.agent_name}</h3>
                  {agent.is_default && (
                    <span className="px-1.5 py-0.5 bg-yellow-500/15 text-yellow-400 text-xs font-semibold rounded-full">Default</span>
                  )}
                  {agent.retell_agent_id ? (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-xs font-semibold rounded-full">
                      <CheckCircleIcon className="w-3 h-3" /> Sincronizado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-xs font-semibold rounded-full">
                      <ExclamationTriangleIcon className="w-3 h-3" /> Sin sincronizar
                    </span>
                  )}
                  {agent.inbound_enabled && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 bg-z-blue/15 text-z-blue-light text-xs font-semibold rounded-full">
                      <PhoneArrowDownLeftIcon className="w-3 h-3" /> Entrante activo
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">
                  {agent.company_name}
                  <span className="ml-2 inline-block px-1.5 py-0.5 bg-slate-700 text-slate-400 text-xs rounded font-mono">ID: {agent.id}</span>
                </p>
              </div>
              <button onClick={() => setDefaultAgent(agent.id).then(load)} className="text-slate-600 hover:text-yellow-400 ml-2 flex-shrink-0">
                {agent.is_default ? <StarSolid className="w-5 h-5 text-yellow-400" /> : <StarIcon className="w-5 h-5" />}
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              <span className="bg-slate-800 px-2 py-0.5 rounded-full">{agent.language}</span>
              {' • '}
              <span className="bg-slate-800 px-2 py-0.5 rounded-full">{
                agent.voice_id === 'custom_voice_a34b86b65a31f267214f0c19d6'
                  ? '🎙 Andrés M'
                  : (agent.voice_id || 'retell-Andrea').replace(/^retell-/, '')
              }</span>
              {' • '}max {agent.max_call_duration}s
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => handleSync(agent)}
                disabled={syncingId === agent.id}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-z-blue-light border border-z-blue/30 rounded-lg hover:bg-z-blue/10 disabled:opacity-50"
              >
                <ArrowPathIcon className={`w-3.5 h-3.5 ${syncingId === agent.id ? 'animate-spin' : ''}`} />
                {syncingId === agent.id ? 'Sincronizando...' : 'Sincronizar'}
              </button>
              <button
                onClick={() => navigate(`/demo?agent=${agent.id}`)}
                disabled={!agent.retell_agent_id}
                title={agent.retell_agent_id ? 'Escuchar una llamada demo con este agente' : 'Sincroniza el agente primero'}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-400 border border-green-500/30 rounded-lg hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <PhoneIcon className="w-3.5 h-3.5" /> Probar
              </button>
              <button onClick={() => setModal(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 border border-z-border rounded-lg hover:bg-white/[0.04]">
                <PencilIcon className="w-3.5 h-3.5" /> Editar
              </button>
              <button onClick={() => handleDuplicate(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-400 border border-z-border rounded-lg hover:bg-white/[0.04]">
                <DocumentDuplicateIcon className="w-3.5 h-3.5" /> Duplicar
              </button>
              <button onClick={() => handleDelete(agent)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/20 rounded-lg hover:bg-red-500/10">
                <TrashIcon className="w-3.5 h-3.5" /> Eliminar
              </button>
            </div>
          </div>
        ))}
        {agents.length === 0 && (
          <div className="col-span-full text-center py-16">
            <UserGroupIcon className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-40" />
            <p className="text-slate-500 text-sm">No hay agentes configurados. Crea tu primer agente para empezar a llamar.</p>
          </div>
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
