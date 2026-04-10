import { useState, useEffect } from 'react'
import { ArrowUpTrayIcon, TrashIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import ImportCSVModal from '../components/ImportCSVModal'
import { getProspects, deleteProspect, getCampaigns } from '../api/client'

const STATUSES = ['', 'pending', 'calling', 'answered', 'voicemail', 'failed', 'do_not_call']

export default function Prospects() {
  const [prospects, setProspects] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showImport, setShowImport] = useState(false)

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Prospectos</h1>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm"
        >
          <ArrowUpTrayIcon className="w-4 h-4" /> Importar CSV
        </button>
      </div>

      <div className="flex gap-3">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        >
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        >
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500 self-center">{prospects.length} prospectos</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Empresa', 'Teléfono', 'Campaña', 'Estado', 'Intentos', 'Última llamada', ''].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {prospects.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-6 py-3 text-gray-500">{p.company || '—'}</td>
                <td className="px-6 py-3 text-gray-700 font-mono text-xs">{p.phone}</td>
                <td className="px-6 py-3 text-gray-500 text-xs">{campaignName(p.campaign_id)}</td>
                <td className="px-6 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3 text-gray-500">{p.call_attempts}</td>
                <td className="px-6 py-3 text-gray-400 text-xs">
                  {p.last_called_at ? new Date(p.last_called_at).toLocaleString() : '—'}
                </td>
                <td className="px-6 py-3">
                  <button
                    onClick={() => handleDelete(p)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400">No hay prospectos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showImport && campaigns.length > 0 && (
        <ImportCSVModal
          campaigns={campaigns}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load() }}
        />
      )}
      {showImport && campaigns.length === 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
            <p className="text-gray-700 mb-4">Debes crear una campaña antes de importar prospectos.</p>
            <button onClick={() => setShowImport(false)} className="px-4 py-2 bg-gold text-white rounded-lg text-sm font-semibold">Cerrar</button>
          </div>
        </div>
      )}
    </div>
  )
}
