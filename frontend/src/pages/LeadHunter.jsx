import { useState, useEffect } from 'react'
import {
  MagnifyingGlassIcon, ShieldCheckIcon, SparklesIcon,
  PaperAirplaneIcon, FireIcon, TrashIcon, ChevronDownIcon,
  ChevronUpIcon, ArrowDownTrayIcon, GlobeAltIcon, PhoneIcon,
  StarIcon, ChatBubbleLeftEllipsisIcon,
} from '@heroicons/react/24/outline'
import {
  scoutLeads, getLeadHunterLeads, checkLead, checkAllLeads,
  craftLeadMessage, craftAllLeads, sendLeadMessage,
  updateLeadHunt, deleteLeadHunt, deleteAllLeadHunts,
} from '../api/client'
import { exportToCsv } from '../utils/exportCsv'

const FILTER_TABS = [
  { key: 'all',     label: 'Todos' },
  { key: 'checked', label: 'Verificados' },
  { key: 'crafted', label: 'Con mensaje' },
  { key: 'sent',    label: 'Enviados' },
  { key: 'hot',     label: '🔥 Calientes' },
]

const INTENT_COLORS = {
  positivo: 'bg-green-500/15 text-green-400',
  negativo: 'bg-red-500/15 text-red-400',
  pregunta: 'bg-blue-500/15 text-blue-400',
}

function Stars({ rating }) {
  const full = Math.floor(rating)
  const half = rating - full >= 0.5
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(n => (
        <StarIcon
          key={n}
          className={`w-3 h-3 ${n <= full ? 'text-amber-400 fill-amber-400' : half && n === full + 1 ? 'text-amber-400' : 'text-slate-700'}`}
        />
      ))}
      <span className="ml-1 text-xs text-slate-400">{rating.toFixed(1)}</span>
    </span>
  )
}

function StatusPill({ lead }) {
  if (lead.sent)           return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400">Enviado</span>
  if (lead.message_es)     return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400">Mensaje listo</span>
  if (lead.passed_checks === true)  return <span className="px-2 py-0.5 text-xs rounded-full bg-teal-500/15 text-teal-400">✓ Verificado</span>
  if (lead.passed_checks === false) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/15 text-red-400">✗ Falló check</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700/60 text-slate-400">Sin revisar</span>
}

export default function LeadHunter() {
  const [leads, setLeads] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [scouting, setScouting] = useState(false)
  const [scoutForm, setScoutForm] = useState({ city: '', limit: 17 })
  const [scoutMsg, setScoutMsg] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [actingId, setActingId] = useState(null)   // id of lead being processed
  const [bulkMsg, setBulkMsg] = useState(null)
  const [sendModal, setSendModal] = useState(null)  // lead for send confirmation
  const [replyModal, setReplyModal] = useState(null) // lead for logging reply

  const loadLeads = (f = filter) => {
    setLoading(true)
    const params = f !== 'all' ? { filter: f } : {}
    getLeadHunterLeads(params)
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadLeads(filter) }, [filter])

  const handleScout = async () => {
    const { city, limit } = scoutForm
    if (!city.trim()) return
    setScouting(true); setScoutMsg(null)
    try {
      const r = await scoutLeads({ city: city.trim(), limit: Number(limit) || 17 })
      setScoutMsg({ ok: true, text: `${r.found} leads encontrados y guardados` })
      setFilter('all')
      loadLeads('all')
    } catch (e) {
      setScoutMsg({ ok: false, text: e.response?.data?.detail || 'Error al buscar' })
    } finally { setScouting(false) }
  }

  const handleCheck = async (lead) => {
    setActingId(lead.id)
    try {
      const updated = await checkLead(lead.id)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
    finally { setActingId(null) }
  }

  const handleCheckAll = async () => {
    setBulkMsg(null)
    try {
      const r = await checkAllLeads()
      setBulkMsg({ ok: true, text: `${r.checked} revisados — ${r.passed} pasaron, ${r.failed} fallaron` })
      loadLeads()
    } catch (e) { setBulkMsg({ ok: false, text: e.response?.data?.detail || 'Error' }) }
  }

  const handleCraft = async (lead) => {
    setActingId(lead.id)
    try {
      const updated = await craftLeadMessage(lead.id)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
      setExpanded(lead.id)
    } catch (e) { alert(e.response?.data?.detail || 'Error al generar mensaje') }
    finally { setActingId(null) }
  }

  const handleCraftAll = async () => {
    setBulkMsg(null)
    try {
      const r = await craftAllLeads()
      setBulkMsg({ ok: true, text: `${r.crafted} mensajes generados${r.errors ? `, ${r.errors} errores` : ''}` })
      loadLeads()
    } catch (e) { setBulkMsg({ ok: false, text: e.response?.data?.detail || 'Error' }) }
  }

  const handleSend = async (lead, channel) => {
    setSendModal(null)
    setActingId(lead.id)
    try {
      const updated = await sendLeadMessage(lead.id, channel)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { alert(e.response?.data?.detail || 'Error al enviar') }
    finally { setActingId(null) }
  }

  const handleToggleHot = async (lead) => {
    try {
      const updated = await updateLeadHunt(lead.id, { is_hot: !lead.is_hot })
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { /* silent */ }
  }

  const handleDelete = async (lead) => {
    if (!confirm(`¿Eliminar "${lead.name}"?`)) return
    try {
      await deleteLeadHunt(lead.id)
      setLeads(prev => prev.filter(l => l.id !== lead.id))
    } catch (e) { alert('Error al eliminar') }
  }

  const handleDeleteAll = async () => {
    if (!confirm(`¿Eliminar todos los leads? Esta acción no se puede deshacer.`)) return
    try {
      await deleteAllLeadHunts()
      setLeads([])
    } catch (e) { alert('Error al eliminar') }
  }

  const handleSaveReply = async (lead, reply, intent) => {
    try {
      const updated = await updateLeadHunt(lead.id, { reply, reply_intent: intent })
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
      setReplyModal(null)
    } catch (e) { alert('Error al guardar') }
  }

  const handleExport = () => {
    exportToCsv(`lead-hunter-${Date.now()}.csv`, leads, [
      { key: 'name',          label: 'Nombre' },
      { key: 'city',          label: 'Ciudad' },
      { key: 'category',      label: 'Categoría' },
      { key: 'phone',         label: 'Teléfono' },
      { key: 'rating',        label: 'Rating' },
      { key: 'reviews_count', label: 'Reseñas' },
      { key: 'website_url',   label: 'Web' },
      { key: 'pain_point',    label: 'Pain Point' },
      { key: 'message_es',    label: 'Mensaje ES' },
      { key: 'sent',          label: 'Enviado' },
      { key: 'reply',         label: 'Respuesta' },
      { key: 'reply_intent',  label: 'Intención' },
    ])
  }

  // Stats
  const total   = leads.length
  const checked = leads.filter(l => l.passed_checks === true).length
  const crafted = leads.filter(l => l.message_es).length
  const sent    = leads.filter(l => l.sent).length
  const hot     = leads.filter(l => l.is_hot).length

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-full">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <MagnifyingGlassIcon className="w-6 h-6 text-blue-400" /> Lead Hunter
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Encuentra, verifica y contacta negocios locales con IA</p>
        </div>
        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Exportar
              </button>
              <button onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors">
                <TrashIcon className="w-3.5 h-3.5" /> Limpiar todo
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scout form */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MagnifyingGlassIcon className="w-4 h-4 text-blue-400" /> Buscar negocios
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Ciudad / Estado</label>
            <input
              type="text" value={scoutForm.city} placeholder="Miami, FL"
              onChange={e => setScoutForm(p => ({ ...p, city: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && handleScout()}
              className="z-input w-full text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Límite de resultados</label>
            <input
              type="number" min={1} max={50} value={scoutForm.limit}
              onChange={e => setScoutForm(p => ({ ...p, limit: e.target.value }))}
              className="z-input w-full text-sm"
            />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleScout}
            disabled={scouting || !scoutForm.city.trim()}
            className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {scouting
              ? <><span className="animate-spin text-base">⟳</span> Buscando en Google Maps...</>
              : <><MagnifyingGlassIcon className="w-4 h-4" /> Buscar leads</>
            }
          </button>
          {scouting && <p className="text-xs text-slate-500 animate-pulse">Buscando negocios en Google Maps, puede tomar unos segundos...</p>}
          {scoutMsg && (
            <p className={`text-xs font-medium ${scoutMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {scoutMsg.ok ? '✓' : '✗'} {scoutMsg.text}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-600">
          Busca automáticamente negocios latinos (taquerías, panaderías, barberías...) con rating 3.0–4.6 ⭐ y entre 5–80 reseñas — el sweet spot donde tu propuesta tiene más impacto.
        </p>
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: 'Total', value: total,   color: 'text-slate-300' },
            { label: 'Verificados', value: checked, color: 'text-teal-400' },
            { label: 'Con mensaje', value: crafted, color: 'text-blue-400' },
            { label: 'Enviados',    value: sent,    color: 'text-green-400' },
            { label: 'Calientes',   value: hot,     color: 'text-amber-400' },
          ].map(s => (
            <div key={s.label} className="bg-z-card border border-z-border rounded-xl p-3 text-center">
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Bulk actions */}
      {total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-500">Acciones masivas:</span>
          <button onClick={handleCheckAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-teal-400 border border-teal-500/30 rounded-lg hover:bg-teal-500/10 transition-colors">
            <ShieldCheckIcon className="w-3.5 h-3.5" /> Verificar todos
          </button>
          <button onClick={handleCraftAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
            <SparklesIcon className="w-3.5 h-3.5" /> Generar todos los mensajes
          </button>
          {bulkMsg && (
            <p className={`text-xs font-medium ${bulkMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {bulkMsg.ok ? '✓' : '✗'} {bulkMsg.text}
            </p>
          )}
        </div>
      )}

      {/* Filter tabs + table */}
      {total > 0 && (
        <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-z-border overflow-x-auto">
            {FILTER_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === t.key
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-black/20">
                <tr>
                  {['Negocio', 'Ciudad', 'Rating', 'Reseñas', 'Tel/Web', 'Estado', 'Acciones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 animate-pulse">Cargando leads...</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-600 text-sm">No hay leads en esta vista.</td></tr>
                ) : leads.map(lead => (
                  <>
                    <tr
                      key={lead.id}
                      className={`hover:bg-white/[0.02] ${lead.is_hot ? 'bg-amber-500/5' : ''}`}
                    >
                      {/* Name */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {lead.is_hot && <span className="text-amber-400 text-xs">🔥</span>}
                          <div>
                            <p className="font-medium text-slate-200 max-w-[180px] truncate" title={lead.name}>{lead.name}</p>
                            <p className="text-xs text-slate-500 truncate max-w-[180px]">{lead.category}</p>
                          </div>
                        </div>
                      </td>
                      {/* City */}
                      <td className="px-4 py-3 text-xs text-slate-400">{lead.city}</td>
                      {/* Rating */}
                      <td className="px-4 py-3"><Stars rating={lead.rating} /></td>
                      {/* Reviews */}
                      <td className="px-4 py-3 text-xs text-slate-400">{lead.reviews_count}</td>
                      {/* Phone / Web */}
                      <td className="px-4 py-3">
                        <div className="space-y-0.5">
                          {lead.phone && (
                            <div className="flex items-center gap-1 text-xs text-slate-300 font-mono">
                              <PhoneIcon className="w-3 h-3 text-slate-500 flex-shrink-0" />
                              {lead.phone}
                            </div>
                          )}
                          {lead.website_url && (
                            <a href={lead.website_url} target="_blank" rel="noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-1 text-xs text-blue-400 hover:underline truncate max-w-[140px]">
                              <GlobeAltIcon className="w-3 h-3 flex-shrink-0" />
                              {lead.website_url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                            </a>
                          )}
                          {!lead.phone && !lead.website_url && <span className="text-slate-600 text-xs">—</span>}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusPill lead={lead} />
                          {lead.reply_intent && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${INTENT_COLORS[lead.reply_intent] || 'bg-slate-700 text-slate-400'}`}>
                              {lead.reply_intent}
                            </span>
                          )}
                        </div>
                      </td>
                      {/* Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Expand/collapse */}
                          <button
                            onClick={() => setExpanded(expanded === lead.id ? null : lead.id)}
                            className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                            title={expanded === lead.id ? 'Colapsar' : 'Ver detalle'}
                          >
                            {expanded === lead.id
                              ? <ChevronUpIcon className="w-3.5 h-3.5" />
                              : <ChevronDownIcon className="w-3.5 h-3.5" />
                            }
                          </button>

                          {/* Verify */}
                          {lead.passed_checks === null || lead.passed_checks === undefined ? (
                            <button
                              onClick={() => handleCheck(lead)}
                              disabled={actingId === lead.id}
                              className="p-1.5 text-teal-500 hover:text-teal-300 transition-colors disabled:opacity-40"
                              title="Verificar calidad"
                            >
                              <ShieldCheckIcon className="w-3.5 h-3.5" />
                            </button>
                          ) : null}

                          {/* Craft message */}
                          {lead.passed_checks !== false && !lead.message_es && (
                            <button
                              onClick={() => handleCraft(lead)}
                              disabled={actingId === lead.id}
                              className="p-1.5 text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40"
                              title="Generar mensaje con IA"
                            >
                              {actingId === lead.id
                                ? <span className="text-xs animate-spin inline-block">⟳</span>
                                : <SparklesIcon className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}

                          {/* Send */}
                          {lead.message_es && !lead.sent && (
                            <button
                              onClick={() => setSendModal(lead)}
                              disabled={actingId === lead.id}
                              className="p-1.5 text-green-400 hover:text-green-300 transition-colors disabled:opacity-40"
                              title="Enviar mensaje"
                            >
                              <PaperAirplaneIcon className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Log reply */}
                          {lead.sent && (
                            <button
                              onClick={() => setReplyModal({ ...lead })}
                              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                              title="Registrar respuesta"
                            >
                              <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Hot toggle */}
                          <button
                            onClick={() => handleToggleHot(lead)}
                            className={`p-1.5 transition-colors ${lead.is_hot ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
                            title={lead.is_hot ? 'Quitar caliente' : 'Marcar caliente'}
                          >
                            <FireIcon className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(lead)}
                            className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                            title="Eliminar"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {expanded === lead.id && (
                      <tr key={`${lead.id}-detail`} className="bg-black/20">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            {/* Pain point */}
                            <div>
                              <p className="text-slate-500 uppercase font-medium mb-1">Pain Point</p>
                              {lead.pain_point
                                ? <p className="text-slate-300 leading-relaxed">{lead.pain_point}</p>
                                : <p className="text-slate-600 italic">Sin generar aún</p>
                              }
                            </div>
                            {/* Message ES */}
                            <div>
                              <p className="text-slate-500 uppercase font-medium mb-1">Mensaje (ES)</p>
                              {lead.message_es
                                ? <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.message_es}</p>
                                : <p className="text-slate-600 italic">Sin generar aún</p>
                              }
                            </div>
                            {/* Message EN */}
                            <div>
                              <p className="text-slate-500 uppercase font-medium mb-1">Message (EN)</p>
                              {lead.message_en
                                ? <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.message_en}</p>
                                : <p className="text-slate-600 italic">Not generated yet</p>
                              }
                            </div>
                            {/* Reply if any */}
                            {lead.reply && (
                              <div className="sm:col-span-3">
                                <p className="text-slate-500 uppercase font-medium mb-1">Respuesta del prospecto</p>
                                <p className="text-slate-300 italic">"{lead.reply}"</p>
                              </div>
                            )}
                            {/* Check reason */}
                            {lead.check_reason && (
                              <div className="sm:col-span-3">
                                <p className="text-slate-500 uppercase font-medium mb-1">Razón check</p>
                                <p className="text-red-400">{lead.check_reason}</p>
                              </div>
                            )}
                          </div>
                          {/* Craft button inside expanded row if no message yet */}
                          {!lead.message_es && lead.passed_checks !== false && (
                            <button
                              onClick={() => handleCraft(lead)}
                              disabled={actingId === lead.id}
                              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors disabled:opacity-40"
                            >
                              {actingId === lead.id
                                ? <><span className="animate-spin">⟳</span> Generando mensaje...</>
                                : <><SparklesIcon className="w-3.5 h-3.5" /> Generar mensaje con IA</>
                              }
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && total === 0 && !scouting && (
        <div className="bg-z-card border border-z-border rounded-xl p-12 text-center">
          <MagnifyingGlassIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">No hay leads todavía</p>
          <p className="text-xs text-slate-600 mt-1">Usa el formulario de arriba para buscar negocios en Google Maps</p>
        </div>
      )}

      {/* Send confirmation modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-100">Confirmar envío</h2>
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                Enviar mensaje a <span className="font-semibold text-slate-100">{sendModal.name}</span>
              </p>
              {sendModal.phone && (
                <p className="text-xs text-slate-500 font-mono">{sendModal.phone}</p>
              )}
              <div className="bg-black/30 rounded-lg p-3 border border-z-border">
                <p className="text-xs text-slate-400 whitespace-pre-wrap">{sendModal.message_es}</p>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => handleSend(sendModal, 'whatsapp')}
                className="flex-1 z-btn-primary text-sm flex items-center justify-center gap-2"
              >
                <PaperAirplaneIcon className="w-4 h-4" /> Enviar por WhatsApp
              </button>
              <button onClick={() => setSendModal(null)} className="z-btn-ghost text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Reply modal */}
      {replyModal && (
        <ReplyModal
          lead={replyModal}
          onSave={handleSaveReply}
          onClose={() => setReplyModal(null)}
        />
      )}
    </div>
  )
}

function ReplyModal({ lead, onSave, onClose }) {
  const [reply, setReply] = useState(lead.reply || '')
  const [intent, setIntent] = useState(lead.reply_intent || '')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-100">Registrar respuesta</h2>
        <p className="text-xs text-slate-500">{lead.name}</p>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Texto de la respuesta</label>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder="Escribe lo que respondió el prospecto..."
            className="z-input w-full text-sm resize-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">Intención</label>
          <div className="flex gap-2">
            {['positivo', 'negativo', 'pregunta'].map(opt => (
              <button
                key={opt}
                onClick={() => setIntent(opt)}
                className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors capitalize ${
                  intent === opt
                    ? opt === 'positivo' ? 'bg-green-500/20 text-green-400 border-green-500/40'
                    : opt === 'negativo' ? 'bg-red-500/20 text-red-400 border-red-500/40'
                    : 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                    : 'text-slate-500 border-z-border hover:bg-white/5'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => onSave(lead, reply, intent)}
            disabled={!reply.trim()}
            className="flex-1 z-btn-primary text-sm disabled:opacity-50"
          >
            Guardar
          </button>
          <button onClick={onClose} className="z-btn-ghost text-sm">Cancelar</button>
        </div>
      </div>
    </div>
  )
}
