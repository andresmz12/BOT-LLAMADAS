import { useState, useEffect } from 'react'
import { FireIcon, ClockIcon, CalendarIcon, ArrowDownTrayIcon, PhoneIcon, XMarkIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import CallDetailModal from '../components/CallDetailModal'
import { getLeads, getCampaigns } from '../api/client'
import { exportToCsv } from '../utils/exportCsv'

const TABS = [
  { key: 'interested', label: 'Interesados', Icon: FireIcon, color: 'text-green-400', empty: 'No hay prospectos interesados aún. Inicia una campaña para ver resultados aquí.' },
  { key: 'callback_requested', label: 'Callbacks', Icon: ClockIcon, color: 'text-yellow-400', empty: 'No hay callbacks pendientes.' },
  { key: 'appointment_scheduled', label: 'Citas agendadas', Icon: CalendarIcon, color: 'text-z-blue-light', empty: 'No hay citas agendadas.' },
]

const SENTIMENT_LABEL = { positive: '😊 Positivo', neutral: '😐 Neutral', negative: '😞 Negativo' }

function fmtDur(s) {
  if (!s) return '—'
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function Leads() {
  const [activeTab, setActiveTab] = useState('interested')
  const [leads, setLeads] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedCall, setSelectedCall] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    const params = { tab: activeTab }
    if (filterCampaign) params.campaign_id = filterCampaign
    getLeads(params)
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }, [activeTab, filterCampaign])

  const copyPhone = (lead) => {
    navigator.clipboard.writeText(lead.prospect_phone).catch(() => {})
    setCopiedId(lead.call_id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleExport = () => {
    const tab = TABS.find(t => t.key === activeTab)
    exportToCsv(`leads-${activeTab}-${Date.now()}.csv`, leads, [
      { key: 'prospect_name', label: 'Nombre' },
      { key: 'prospect_company', label: 'Empresa' },
      { key: 'prospect_phone', label: 'Teléfono' },
      { key: 'campaign_name', label: 'Campaña' },
      { key: 'started_at', label: 'Fecha' },
      { key: 'notes', label: 'Resumen' },
      { key: 'outcome', label: 'Resultado' },
      { key: 'recording_url', label: 'Grabación' },
    ])
  }

  const currentTab = TABS.find(t => t.key === activeTab)

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-100">Centro de Leads</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {campaigns.length > 0 && (
            <select
              value={filterCampaign}
              onChange={e => setFilterCampaign(e.target.value)}
              className="z-input w-auto text-sm"
            >
              <option value="">Todas las campañas</option>
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button
            onClick={handleExport}
            disabled={leads.length === 0}
            className="flex items-center gap-2 px-3 py-2 bg-z-card border border-z-border hover:bg-white/5 text-slate-300 text-sm rounded-lg transition-colors disabled:opacity-40"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-black/20 border border-z-border rounded-xl p-1 w-fit">
        {TABS.map(tab => {
          const Icon = tab.Icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-z-card text-slate-100 shadow'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <Icon className={`w-4 h-4 ${activeTab === tab.key ? tab.color : ''}`} />
              {tab.label}
              {activeTab === tab.key && leads.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 bg-slate-700 text-slate-300 text-xs rounded-full">{leads.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Table */}
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="bg-black/20">
              <tr>
                {['Nombre', 'Empresa', 'Teléfono', 'Campaña', 'Fecha', 'Duración', 'Sentimiento', 'Resumen', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-z-border">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-slate-500">Cargando...</td></tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <currentTab.Icon className={`w-8 h-8 ${currentTab.color} mx-auto mb-2 opacity-40`} />
                    <p className="text-slate-500 text-sm">{currentTab.empty}</p>
                  </td>
                </tr>
              ) : leads.map(lead => (
                <tr
                  key={lead.call_id}
                  className="hover:bg-white/[0.02] cursor-pointer"
                  onClick={() => setSelectedCall(lead)}
                >
                  <td className="px-4 py-3 font-medium text-slate-200">{lead.prospect_name}</td>
                  <td className="px-4 py-3 text-slate-400">{lead.prospect_company}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-xs text-slate-300">{lead.prospect_phone}</span>
                      <button
                        onClick={e => { e.stopPropagation(); copyPhone(lead) }}
                        className="text-slate-600 hover:text-slate-300 transition-colors"
                        title="Copiar teléfono"
                      >
                        {copiedId === lead.call_id
                          ? <span className="text-green-400 text-xs font-medium">✓</span>
                          : <PhoneIcon className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{lead.campaign_name}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(lead.started_at)}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{fmtDur(lead.duration_seconds)}</td>
                  <td className="px-4 py-3 text-xs">{SENTIMENT_LABEL[lead.sentiment] || '—'}</td>
                  <td className="px-4 py-3 text-slate-400 text-xs max-w-[200px] truncate">{lead.notes || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedCall(lead) }}
                      className="text-xs text-z-blue-light hover:underline whitespace-nowrap"
                    >
                      Ver llamada
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  )
}
