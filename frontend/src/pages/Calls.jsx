import { useState, useEffect } from 'react'
import StatusBadge from '../components/StatusBadge'
import CallDetailModal from '../components/CallDetailModal'
import { getCalls, getCallDetail, getCampaigns } from '../api/client'

const OUTCOMES = ['', 'interested', 'not_interested', 'callback_requested', 'appointment_scheduled', 'voicemail', 'wrong_number', 'failed']
const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞' }

export default function Calls() {
  const [calls, setCalls] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [selectedCall, setSelectedCall] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isViewer = user.role === 'viewer'

  const load = () => {
    const params = {}
    if (filterCampaign) params.campaign_id = filterCampaign
    if (filterOutcome) params.outcome = filterOutcome
    getCalls(params).then(setCalls).catch(() => {})
  }

  useEffect(() => { getCampaigns().then(setCampaigns).catch(() => {}) }, [])
  useEffect(() => { load() }, [filterCampaign, filterOutcome])

  const openDetail = async (call) => {
    try {
      const detail = await getCallDetail(call.id)
      setSelectedCall(detail)
    } catch {
      setSelectedCall(call)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-zyra-text">Llamadas</h1>

      <div className="flex gap-3 flex-wrap">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="bg-zyra-card border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
        >
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterOutcome}
          onChange={e => setFilterOutcome(e.target.value)}
          className="bg-zyra-card border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"
        >
          {OUTCOMES.map(o => <option key={o} value={o}>{o || 'Todos los outcomes'}</option>)}
        </select>
        <span className="ml-auto text-sm text-zyra-muted self-center">{calls.length} llamadas</span>
      </div>

      <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F172A]">
            <tr>
              {['Prospecto', 'Empresa', 'Teléfono', 'Tipo', 'Outcome', 'Sentimiento', 'Duración', 'Fecha'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zyra-muted uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zyra-border">
            {calls.map(call => (
              <tr
                key={call.id}
                onClick={() => openDetail(call)}
                className="hover:bg-white/5 cursor-pointer"
              >
                <td className="px-6 py-3 font-medium text-zyra-text">{call.prospect_name || '—'}</td>
                <td className="px-6 py-3 text-zyra-muted">{call.prospect_company || '—'}</td>
                <td className="px-6 py-3 text-zyra-text font-mono text-xs">{call.prospect_phone || '—'}</td>
                <td className="px-6 py-3">
                  {call.call_type === 'inbound'
                    ? <span className="px-2 py-0.5 bg-blue-900/40 text-blue-400 text-xs rounded-full font-medium">Entrante</span>
                    : <span className="px-2 py-0.5 bg-white/10 text-zyra-muted text-xs rounded-full font-medium">Saliente</span>
                  }
                </td>
                <td className="px-6 py-3"><StatusBadge status={call.outcome} /></td>
                <td className="px-6 py-3 text-zyra-muted">
                  {call.sentiment ? `${SENTIMENT_EMOJI[call.sentiment] || ''} ${call.sentiment}` : '—'}
                </td>
                <td className="px-6 py-3 text-zyra-muted">
                  {call.duration_seconds ? `${call.duration_seconds}s` : '—'}
                </td>
                <td className="px-6 py-3 text-zyra-muted text-xs">
                  {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-zyra-muted">No hay llamadas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedCall && (
        <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />
      )}
    </div>
  )
}
