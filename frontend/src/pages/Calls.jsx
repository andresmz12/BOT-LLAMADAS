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
      <h1 className="text-2xl font-bold text-gray-900">Llamadas</h1>

      <div className="flex gap-3 flex-wrap">
        <select
          value={filterCampaign}
          onChange={e => setFilterCampaign(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        >
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterOutcome}
          onChange={e => setFilterOutcome(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
        >
          {OUTCOMES.map(o => <option key={o} value={o}>{o || 'Todos los outcomes'}</option>)}
        </select>
        <span className="ml-auto text-sm text-gray-500 self-center">{calls.length} llamadas</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Prospecto', 'Empresa', 'Teléfono', 'Outcome', 'Sentimiento', 'Duración', 'Fecha'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {calls.map(call => (
              <tr
                key={call.id}
                onClick={() => openDetail(call)}
                className="hover:bg-gray-50 cursor-pointer"
              >
                <td className="px-6 py-3 font-medium text-gray-900">{call.prospect_name || '—'}</td>
                <td className="px-6 py-3 text-gray-500">{call.prospect_company || '—'}</td>
                <td className="px-6 py-3 text-gray-700 font-mono text-xs">{call.prospect_phone || '—'}</td>
                <td className="px-6 py-3"><StatusBadge status={call.outcome} /></td>
                <td className="px-6 py-3 text-gray-600">
                  {call.sentiment ? `${SENTIMENT_EMOJI[call.sentiment] || ''} ${call.sentiment}` : '—'}
                </td>
                <td className="px-6 py-3 text-gray-500">
                  {call.duration_seconds ? `${call.duration_seconds}s` : '—'}
                </td>
                <td className="px-6 py-3 text-gray-400 text-xs">
                  {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400">No hay llamadas registradas</td></tr>
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
