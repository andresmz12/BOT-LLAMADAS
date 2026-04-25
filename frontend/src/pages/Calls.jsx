import { useState, useEffect } from 'react'
import { TrashIcon, PhoneArrowUpRightIcon, ChevronRightIcon, XMarkIcon, ForwardIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import CallDetailModal from '../components/CallDetailModal'
import { getCalls, getCallDetail, getCampaigns, deleteCalls, callProspect } from '../api/client'
import { fmtDate } from '../utils/date'

const OUTCOMES = ['', 'interested', 'not_interested', 'callback_requested', 'appointment_scheduled', 'voicemail', 'no_answer', 'wrong_number']
const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞' }

export default function Calls() {
  const [calls, setCalls] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterOutcome, setFilterOutcome] = useState('')
  const [selectedCall, setSelectedCall] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [callingId, setCallingId] = useState(null)
  const [queue, setQueue] = useState(null) // { items: [...], index: 0, calling: false }

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

  const handleCall = async (prospectId) => {
    if (callingId) return
    setCallingId(prospectId)
    try { await callProspect(prospectId); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error al llamar') }
    finally { setCallingId(null) }
  }

  // Cola secuencial
  const startQueue = () => {
    const items = calls.filter(c => c.prospect_id && !c.is_demo)
    if (!items.length) return
    setQueue({ items, index: 0, calling: false })
  }

  const queueCall = async () => {
    if (!queue || queue.calling) return
    const item = queue.items[queue.index]
    if (!item?.prospect_id) return
    setQueue(q => ({ ...q, calling: true }))
    try { await callProspect(item.prospect_id) }
    catch (err) { alert(err.response?.data?.detail || 'Error al llamar') }
    finally {
      setQueue(q => q ? ({ ...q, calling: false }) : null)
      load()
    }
  }

  const queueNext = () => {
    setQueue(q => {
      if (!q) return null
      const next = q.index + 1
      return next >= q.items.length ? null : { ...q, index: next, calling: false }
    })
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Llamadas</h1>
        {calls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {calls.some(c => c.prospect_id && !c.is_demo) && (
              <button onClick={startQueue}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-green-400 border border-green-500/30 hover:bg-green-500/10 rounded-lg transition-colors">
                <PhoneArrowUpRightIcon className="w-3.5 h-3.5" />
                Llamar en orden ({calls.filter(c => c.prospect_id && !c.is_demo).length})
              </button>
            )}
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
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-full sm:w-auto">
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterOutcome} onChange={e => setFilterOutcome(e.target.value)} className="z-input w-full sm:w-auto">
          {OUTCOMES.map(o => <option key={o} value={o}>{o || 'Todos los outcomes'}</option>)}
        </select>
        <span className="text-sm text-slate-500">{calls.length} llamadas</span>
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead className="bg-black/20">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allChecked} ref={el => { if (el) el.indeterminate = someChecked }}
                  onChange={toggleAll} className="rounded border-slate-600 bg-slate-800 text-z-blue cursor-pointer" />
              </th>
              {['Prospecto', 'Empresa', 'Teléfono', 'Tipo', 'Outcome', 'Sentimiento', 'Duración', 'Fecha', ''].map(h => (
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
                  {fmtDate(call.started_at)}
                </td>
                <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                  {call.prospect_id && !call.is_demo && (
                    <button onClick={() => handleCall(call.prospect_id)} disabled={callingId === call.prospect_id}
                      title="Volver a llamar"
                      className="text-slate-600 hover:text-green-400 transition-colors disabled:opacity-40">
                      <PhoneArrowUpRightIcon className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {calls.length === 0 && (
              <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-500">No hay llamadas registradas</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}

      {/* Cola secuencial */}
      {queue && (() => {
        const item = queue.items[queue.index]
        const isLast = queue.index >= queue.items.length - 1
        return (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-lg px-4">
            <div className="bg-z-card border border-z-border rounded-2xl shadow-2xl p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wide mb-0.5">
                    Cola de rellamadas — {queue.index + 1} / {queue.items.length}
                  </p>
                  <p className="text-lg font-bold text-slate-100">{item.prospect_name || '—'}</p>
                  <p className="text-sm text-slate-400">{item.prospect_company || ''}</p>
                  <p className="text-sm font-mono text-slate-300 mt-0.5">{item.prospect_phone || '—'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={item.outcome} />
                  <button onClick={() => setQueue(null)} className="text-slate-500 hover:text-slate-300 ml-1">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-1 mb-4">
                <div className="bg-z-blue h-1 rounded-full transition-all"
                  style={{ width: `${((queue.index + 1) / queue.items.length) * 100}%` }} />
              </div>
              <div className="flex items-center gap-3">
                <button onClick={queueCall} disabled={queue.calling}
                  className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors flex-1 justify-center">
                  <PhoneArrowUpRightIcon className="w-4 h-4" />
                  {queue.calling ? 'Llamando...' : 'Llamar'}
                </button>
                {!isLast && (
                  <button onClick={queueNext} title="Saltar al siguiente"
                    className="flex items-center gap-1.5 px-4 py-2.5 border border-z-border text-slate-400 hover:text-slate-200 hover:border-slate-500 rounded-lg text-sm transition-colors">
                    <ForwardIcon className="w-4 h-4" />
                    Saltar
                  </button>
                )}
                {isLast && !queue.calling && (
                  <button onClick={() => setQueue(null)}
                    className="px-4 py-2.5 border border-z-border text-slate-400 hover:text-slate-200 rounded-lg text-sm transition-colors">
                    Finalizar
                  </button>
                )}
              </div>
              {!isLast && (
                <p className="text-xs text-slate-600 mt-3 text-center">
                  Siguiente: {queue.items[queue.index + 1]?.prospect_name || '—'}
                </p>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
