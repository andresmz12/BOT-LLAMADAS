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
    try { const detail = await getCallDetail(call.id); setSelectedCall(detail) }
    catch { setSelectedCall(call) }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Llamadas</h1>
      <div className="flex gap-3 flex-wrap">
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-auto">
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="z-input w-auto">
          {OUTCOMES.map(o => <option key={o} value={o}>{o || 'Todos los outcomes'}</option>)}
        </select>
        <span className="ml-auto text-sm text-slate-500 self-center">{calls.length} llamadas</span>
      </div>
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/20">
            <tr>
              {['Prospecto', 'Empresa', 'Teléfono', 'Tipo', 'Outcome', 'Sentimiento', 'Duración', 'Fecha'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {calls.map(call => (
              <tr key={call.id} onClick={() => openDetail(call)} className="hover:bg-white/[0.02] cursor-pointer">
                <td className="px-6 py-3 font-medium text-slate-200">{call.prospect_name || '—'}</td>
                <td className="px-6 py-3 text-slate-400">{call.prospect_company || '—'}</td>
                <td className="px-6 py-3 text-slate-300 font-mono text-xs">{call.prospect_phone || '—'}</td>
                <td className="px-6 py-3">
                  {call.call_type === 'inbound'
                    ? <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 text-xs rounded-full font-medium">Entrante</span>
                    : <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded-full font-medium">Saliente</span>}
                </td>
                <td className="px-6 py-3"><StatusBadge status={call.outcome} /></td>
                <td className="px-6 py-3 text-slate-400">
                  {call.sentiment ? `${SENTIMENT_EMOJI[call.sentiment] || ''} ${call.sentiment}` : '—'}
                </td>
                <td className="px-6 py-3 text-slate-500">{call.duration_seconds ? `${call.duration_seconds}s` : '—'}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No hay llamadas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </div>
  )
}
