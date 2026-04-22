import { useState, useEffect } from 'react'
import { TrashIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import CallDetailModal from '../components/CallDetailModal'
import { getCalls, getCallDetail, getCampaigns, deleteCalls } from '../api/client'

const OUTCOMES = ['', 'interested', 'not_interested', 'callback_requested', 'appointment_scheduled', 'voicemail', 'no_answer', 'wrong_number']
const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞' }

export default function Calls() {
  const [calls, setCalls] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [selectedCall, setSelectedCall] = useState(null)
  const [selected, setSelected] = useState(new Set())

  const load = () => {
    const params = {}
    if (filterCampaign) params.campaign_id = filterCampaign
    if (filterOutcome) params.outcome = filterOutcome
    getCalls(params).then(data => { setCalls(data); setSelected(new Set()) }).catch(() => {})
  }

  useEffect(() => { getCampaigns().then(setCampaigns).catch(() => {}) }, [])
  useEffect(() => { load() }, [filterCampaign, filterOutcome])

  const toggleAll = (e) => {
    setSelected(e.target.checked ? new Set(calls.map(c => c.id)) : new Set())
  }
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const openDetail = async (call) => {
    try { const detail = await getCallDetail(call.id); setSelectedCall(detail) }
    catch { setSelectedCall(call) }
  }

  const handleDeleteSelected = async () => {
    if (!confirm(`¿Eliminar ${selected.size} llamada(s) seleccionada(s)?`)) return
    try {
      const res = await deleteCalls({ ids: [...selected].join(',') })
      alert(`${res.deleted} llamadas eliminadas.`)
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleDeleteAll = async () => {
    const scope = filterCampaign || filterOutcome ? `las ${calls.length} llamadas del filtro actual` : `TODAS las ${calls.length} llamadas`
    if (!confirm(`¿Eliminar ${scope}? Esta acción no se puede deshacer.`)) return
    try {
      const params = {}
      if (filterCampaign) params.campaign_id = filterCampaign
      if (filterOutcome) params.outcome = filterOutcome
      const res = await deleteCalls(params)
      alert(`${res.deleted} llamadas eliminadas.`)
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const allChecked = calls.length > 0 && selected.size === calls.length
  const someChecked = selected.size > 0 && selected.size < calls.length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-100">Llamadas</h1>
        {calls.length > 0 && (
          <div className="flex gap-2">
            {selected.size > 0 && (
              <button onClick={handleDeleteSelected}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">
                <TrashIcon className="w-3.5 h-3.5" />
                Eliminar seleccionadas ({selected.size})
              </button>
            )}
            <button onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">
              <TrashIcon className="w-3.5 h-3.5" />
              Eliminar {filterCampaign || filterOutcome ? 'filtradas' : 'todas'}
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-auto">
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="z-input w-auto">
          {OUTCOMES.map(o => <option key={o} value={o}>{o || 'Todos los outcomes'}</option>)}
        </select>
        <span className="text-sm text-slate-500">{calls.length} llamadas</span>
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-black/20">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }}
                  onChange={toggleAll} className="rounded border-slate-600 bg-slate-800 text-z-blue cursor-pointer" />
              </th>
              {['Prospecto', 'Empresa', 'Teléfono', 'Tipo', 'Outcome', 'Sentimiento', 'Duración', 'Fecha'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {calls.map(call => (
              <tr key={call.id} className={`hover:bg-white/[0.02] cursor-pointer ${selected.has(call.id) ? 'bg-z-blue/5' : ''}`}>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  <input type="checkbox" checked={selected.has(call.id)} onChange={() => toggleOne(call.id)}
                    className="rounded border-slate-600 bg-slate-800 text-z-blue cursor-pointer" />
                </td>
                <td className="px-6 py-3 font-medium text-slate-200" onClick={() => openDetail(call)}>{call.prospect_name || '—'}</td>
                <td className="px-6 py-3 text-slate-400" onClick={() => openDetail(call)}>{call.prospect_company || '—'}</td>
                <td className="px-6 py-3 text-slate-300 font-mono text-xs" onClick={() => openDetail(call)}>{call.prospect_phone || '—'}</td>
                <td className="px-6 py-3" onClick={() => openDetail(call)}>
                  {call.call_type === 'inbound'
                    ? <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 text-xs rounded-full font-medium">Entrante</span>
                    : <span className="px-2 py-0.5 bg-slate-700 text-slate-400 text-xs rounded-full font-medium">Saliente</span>}
                </td>
                <td className="px-6 py-3" onClick={() => openDetail(call)}><StatusBadge status={call.outcome} /></td>
                <td className="px-6 py-3 text-slate-400" onClick={() => openDetail(call)}>
                  {call.sentiment ? `${SENTIMENT_EMOJI[call.sentiment] || ''} ${call.sentiment}` : '—'}
                </td>
                <td className="px-6 py-3 text-slate-500" onClick={() => openDetail(call)}>{call.duration_seconds ? `${call.duration_seconds}s` : '—'}</td>
                <td className="px-6 py-3 text-slate-500 text-xs" onClick={() => openDetail(call)}>
                  {call.started_at ? new Date(call.started_at).toLocaleString() : '—'}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={9} className="px-6 py-12 text-center text-slate-500">No hay llamadas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </div>
  )
}
