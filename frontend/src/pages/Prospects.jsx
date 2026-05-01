import { useState, useEffect } from 'react'
import { ArrowUpTrayIcon, TrashIcon, PlusIcon, XMarkIcon, PhoneArrowUpRightIcon, ArrowPathIcon, ClockIcon, ArrowDownTrayIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import ImportCSVModal from '../components/ImportCSVModal'
import UpgradeBanner from '../components/UpgradeBanner'
import CallDetailModal from '../components/CallDetailModal'
import { getProspects, deleteProspect, deleteAllProspects, retryProspects, getCampaigns, createProspect, callProspect, getDemoStatus, getCalls, searchApifyProspects } from '../api/client'
import { exportToCsv } from '../utils/exportCsv'
import { fmtDate } from '../utils/date'

const STATUSES = ['', 'pending', 'calling', 'answered', 'voicemail', 'failed', 'do_not_call']

const PHONE_PREFIXES = [
  { code: '+1',   flag: '🇺🇸', label: '+1' },
  { code: '+52',  flag: '🇲🇽', label: '+52' },
  { code: '+57',  flag: '🇨🇴', label: '+57' },
  { code: '+54',  flag: '🇦🇷', label: '+54' },
  { code: '+56',  flag: '🇨🇱', label: '+56' },
  { code: '+51',  flag: '🇵🇪', label: '+51' },
  { code: '+34',  flag: '🇪🇸', label: '+34' },
  { code: '+55',  flag: '🇧🇷', label: '+55' },
  { code: '+58',  flag: '🇻🇪', label: '+58' },
  { code: '+593', flag: '🇪🇨', label: '+593' },
  { code: '+502', flag: '🇬🇹', label: '+502' },
  { code: '+503', flag: '🇸🇻', label: '+503' },
  { code: '+504', flag: '🇭🇳', label: '+504' },
  { code: '+505', flag: '🇳🇮', label: '+505' },
  { code: '+506', flag: '🇨🇷', label: '+506' },
  { code: '+507', flag: '🇵🇦', label: '+507' },
  { code: '+598', flag: '🇺🇾', label: '+598' },
  { code: '+595', flag: '🇵🇾', label: '+595' },
  { code: '+591', flag: '🇧🇴', label: '+591' },
]

function NewProspectModal({ campaigns, onClose, onSaved }) {
  const [form, setForm] = useState({ name: '', phoneDigits: '', phonePrefix: '+1', company: '', campaign_id: campaigns[0]?.id || '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const phone = form.phonePrefix + form.phoneDigits.replace(/\D/g, '')
      await createProspect({ name: form.name, phone, company: form.company, campaign_id: Number(form.campaign_id) })
      onSaved()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">Nuevo Prospecto</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nombre *</label>
            <input required value={form.name} onChange={e => set('name', e.target.value)}
              placeholder="Juan Pérez" className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Teléfono *</label>
            <div className="flex gap-2">
              <select value={form.phonePrefix} onChange={e => set('phonePrefix', e.target.value)}
                className="z-input w-28 flex-shrink-0 font-mono">
                {PHONE_PREFIXES.map(p => (
                  <option key={p.code} value={p.code}>{p.flag} {p.label}</option>
                ))}
              </select>
              <input required value={form.phoneDigits} onChange={e => set('phoneDigits', e.target.value)}
                placeholder="5551234567" className="z-input flex-1 font-mono"
                inputMode="numeric" />
            </div>
            <p className="text-xs text-slate-500 mt-1">Solo dígitos, sin espacios ni guiones</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Empresa</label>
            <input value={form.company} onChange={e => set('company', e.target.value)}
              placeholder="Empresa S.A." className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Campaña *</label>
            <select required value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)} className="z-input">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="z-btn-primary">
              {loading ? 'Guardando...' : 'Agregar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProspectHistoryModal({ prospect, onClose }) {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCall, setSelectedCall] = useState(null)

  useEffect(() => {
    getCalls({ prospect_id: prospect.id })
      .then(setCalls)
      .catch(() => setCalls([]))
      .finally(() => setLoading(false))
  }, [prospect.id])

  return (
    <>
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-z-border">
            <div>
              <h2 className="text-lg font-bold text-slate-100">Historial de llamadas</h2>
              <p className="text-sm text-slate-400">{prospect.name} · {prospect.phone}</p>
            </div>
            <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="bg-black/20 sticky top-0">
                <tr>
                  {['Fecha', 'Duración', 'Resultado', 'Sentimiento', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Cargando...</td></tr>
                ) : calls.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Sin llamadas registradas</td></tr>
                ) : calls.map(c => (
                  <tr key={c.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelectedCall(c)}>
                    <td className="px-4 py-3 text-slate-400 text-xs">{fmtDate(c.started_at)}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs">{c.duration_seconds ? (c.duration_seconds >= 60 ? `${Math.floor(c.duration_seconds/60)}m ${c.duration_seconds%60}s` : `${c.duration_seconds}s`) : '—'}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.outcome || c.status} /></td>
                    <td className="px-4 py-3 text-xs text-slate-400">{c.sentiment || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={e => { e.stopPropagation(); setSelectedCall(c) }} className="text-xs text-z-blue-light hover:underline">Ver</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selectedCall && <CallDetailModal call={selectedCall} onClose={() => setSelectedCall(null)} />}
    </>
  )
}

function ApifySearchModal({ campaigns, onClose, onImported }) {
  const [form, setForm] = useState({
    search_term: '',
    location: '',
    max_results: 50,
    campaign_id: campaigns[0]?.id || '',
    exclude_keywords: '',
    exclude_chains: true,
    min_rating: 0,
    skip_closed: true,
    require_phone: true,
    language: 'en',
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setResult(null)
    try {
      const res = await searchApifyProspects({
        ...form,
        campaign_id: Number(form.campaign_id),
        max_results: Number(form.max_results),
        min_rating: Number(form.min_rating),
      })
      setResult(res)
      onImported()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Buscar prospectos con IA</h2>
            <p className="text-xs text-slate-500 mt-0.5">Google Maps via Apify · Los resultados se importan directo a tu campaña</p>
          </div>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Search */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-300 mb-1">¿Qué tipo de negocio buscas? *</label>
              <input required value={form.search_term} onChange={e => set('search_term', e.target.value)}
                placeholder="ej: tiendas de abarrotes, talleres mecánicos, dentistas"
                className="z-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Ciudad o estado *</label>
              <input required value={form.location} onChange={e => set('location', e.target.value)}
                placeholder="ej: Chicago IL, Dallas TX"
                className="z-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Idioma de búsqueda</label>
              <select value={form.language} onChange={e => set('language', e.target.value)} className="z-input">
                <option value="en">Inglés</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>

          {/* Filters */}
          <div className="border border-z-border rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Filtros de calidad</p>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">
                Excluir negocios que contengan estas palabras
                <span className="text-slate-500 font-normal ml-1">(separadas por coma)</span>
              </label>
              <input value={form.exclude_keywords} onChange={e => set('exclude_keywords', e.target.value)}
                placeholder="ej: corp, inc, llc, chain, franchise, group"
                className="z-input" />
              <p className="text-xs text-slate-600 mt-1">Se filtrará cualquier negocio cuyo nombre contenga estas palabras</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Rating mínimo en Google</label>
                <select value={form.min_rating} onChange={e => set('min_rating', e.target.value)} className="z-input">
                  <option value={0}>Sin mínimo</option>
                  <option value={3}>3.0+ ⭐</option>
                  <option value={3.5}>3.5+ ⭐</option>
                  <option value={4}>4.0+ ⭐</option>
                  <option value={4.5}>4.5+ ⭐</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Máx. prospectos a importar</label>
                <select value={form.max_results} onChange={e => set('max_results', e.target.value)} className="z-input">
                  {[25, 50, 100, 150, 200].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.exclude_chains} onChange={e => set('exclude_chains', e.target.checked)} className="w-4 h-4 accent-purple-500" />
                <span className="text-sm text-slate-300">Excluir cadenas y franquicias conocidas</span>
                <span className="text-xs text-slate-500">(Walmart, McDonald's, Starbucks…)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.skip_closed} onChange={e => set('skip_closed', e.target.checked)} className="w-4 h-4 accent-purple-500" />
                <span className="text-sm text-slate-300">Excluir negocios permanentemente cerrados</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.require_phone} onChange={e => set('require_phone', e.target.checked)} className="w-4 h-4 accent-purple-500" />
                <span className="text-sm text-slate-300">Solo importar si tienen número de teléfono</span>
              </label>
            </div>
          </div>

          {/* Campaign */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Campaña destino *</label>
            <select required value={form.campaign_id} onChange={e => set('campaign_id', e.target.value)} className="z-input">
              {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {loading && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300 flex items-center gap-2">
              <ArrowPathIcon className="w-4 h-4 animate-spin flex-shrink-0" />
              Buscando negocios en Google Maps… puede tomar 1-3 minutos.
            </div>
          )}

          {result && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 text-xs text-green-300 space-y-1">
              <p className="font-semibold">✓ Búsqueda completada</p>
              <p>Encontrados: {result.total_found} · Importados: <span className="font-bold">{result.imported}</span></p>
              {result.skipped_no_phone > 0 && <p className="text-slate-500">Sin teléfono: {result.skipped_no_phone}</p>}
              {result.skipped_excluded > 0 && <p className="text-slate-500">Filtrados por exclusión: {result.skipped_excluded}</p>}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{result ? 'Cerrar' : 'Cancelar'}</button>
            {!result && (
              <button type="submit" disabled={loading} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50">
                <MagnifyingGlassIcon className="w-4 h-4" />
                {loading ? 'Buscando...' : 'Buscar e importar'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default function Prospects() {
  const [prospects, setProspects] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [filterCampaign, setFilterCampaign] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showApifySearch, setShowApifySearch] = useState(false)
  const [callingId, setCallingId] = useState(null)
  const [historyProspect, setHistoryProspect] = useState(null)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isFree = user.plan === 'free'
  const apifyEnabled = user.apify_enabled === true
  const [demoStatus, setDemoStatus] = useState(null)

  const handleCall = async (p) => {
    if (callingId) return
    setCallingId(p.id)
    try { await callProspect(p.id); load() }
    catch (err) { alert('Error: ' + (err.response?.data?.detail || err.message)) }
    finally { setCallingId(null) }
  }

  const load = () => {
    const params = {}
    if (filterCampaign) params.campaign_id = filterCampaign
    if (filterStatus) params.status = filterStatus
    getProspects(params).then(setProspects).catch(() => {})
  }

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(() => {})
    if (isFree) getDemoStatus().then(setDemoStatus).catch(() => {})
  }, [])
  useEffect(() => { load() }, [filterCampaign, filterStatus])

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar a "${p.name}"?`)) return
    try { await deleteProspect(p.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleRetry = async () => {
    const label = filterStatus
      ? `los ${prospects.length} prospectos con estado "${filterStatus}"`
      : `todos los prospectos fallidos y con buzón de voz`
    if (!confirm(`¿Reintentar llamadas para ${label}?\n\nSe resetearán a "pending" para la próxima ejecución de campaña.`)) return
    try {
      const params = {}
      if (filterCampaign) params.campaign_id = filterCampaign
      if (filterStatus) params.status = filterStatus
      const res = await retryProspects(params)
      alert(`${res.reset} prospectos marcados para reintento.`)
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleDeleteAll = async () => {
    const scope = filterCampaign
      ? `los ${prospects.length} prospectos de esta campaña`
      : `TODOS los ${prospects.length} prospectos`
    if (!confirm(`¿Eliminar ${scope}? Esta acción no se puede deshacer.`)) return
    try {
      const params = filterCampaign ? { campaign_id: filterCampaign } : {}
      const res = await deleteAllProspects(params)
      alert(`${res.deleted} prospectos eliminados.`)
      load()
    } catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleExportCsv = () => {
    exportToCsv(`prospectos-${Date.now()}.csv`, prospects, [
      { key: 'name', label: 'Nombre' },
      { key: 'company', label: 'Empresa' },
      { key: 'phone', label: 'Teléfono' },
      { key: 'status', label: 'Estado' },
      { key: 'call_attempts', label: 'Intentos' },
    ])
  }

  const campaignName = (id) => campaigns.find(c => c.id === id)?.name || `#${id}`
  const noCampaigns = campaigns.length === 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-100">Prospectos</h1>
        <div className="flex flex-wrap gap-2">
          {prospects.length > 0 && (
            <button onClick={handleExportCsv}
              className="flex items-center gap-2 px-3 py-2 bg-z-card border border-z-border hover:bg-white/5 text-slate-300 text-sm rounded-lg transition-colors">
              <ArrowDownTrayIcon className="w-4 h-4" /> Exportar CSV
            </button>
          )}
          {!isFree && (
            <>
            {apifyEnabled && (
              <button onClick={() => setShowApifySearch(true)}
                className="flex items-center gap-2 px-4 py-2 border border-purple-500 text-purple-400 hover:bg-purple-500/10 font-semibold rounded-lg text-sm transition-colors">
                <MagnifyingGlassIcon className="w-4 h-4" /> Buscar prospectos
              </button>
            )}
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 border border-z-blue text-z-blue-light hover:bg-z-blue/10 font-semibold rounded-lg text-sm transition-colors">
              <PlusIcon className="w-4 h-4" /> Nuevo prospecto
            </button>
            <button onClick={() => setShowImport(true)} className="z-btn-primary flex items-center gap-2">
              <ArrowUpTrayIcon className="w-4 h-4" /> Importar Excel / CSV
            </button>
            </>
          )}
        </div>
      </div>

      {isFree && (
        <UpgradeBanner compact demosUsed={demoStatus?.demo_calls_used ?? 0} />
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} className="z-input w-full sm:w-auto">
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="z-input w-full sm:w-auto">
          {STATUSES.map(s => <option key={s} value={s}>{s || 'Todos los estados'}</option>)}
        </select>
        <span className="text-sm text-slate-500">{prospects.length} prospectos</span>
        {prospects.length > 0 && (
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-z-blue-light border border-z-blue/30 hover:bg-z-blue/10 rounded-lg transition-colors">
              <ArrowPathIcon className="w-3.5 h-3.5" />
              Reintentar {filterStatus ? `"${filterStatus}"` : 'fallidas'}
            </button>
            <button onClick={handleDeleteAll}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors">
              <TrashIcon className="w-3.5 h-3.5" />
              Eliminar {filterCampaign ? 'campaña' : 'todos'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-black/20">
            <tr>
              {['Nombre', 'Empresa', 'Teléfono', 'Campaña', 'Estado', 'Intentos', 'Última llamada', 'Acciones'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {prospects.map(p => (
              <tr key={p.id} className="hover:bg-white/[0.02]">
                <td className="px-6 py-3 font-medium text-slate-200">{p.name}</td>
                <td className="px-6 py-3 text-slate-400">{p.company || '—'}</td>
                <td className="px-6 py-3 text-slate-300 font-mono text-xs">{p.phone}</td>
                <td className="px-6 py-3 text-slate-400 text-xs">{campaignName(p.campaign_id)}</td>
                <td className="px-6 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3 text-slate-400">{p.call_attempts}</td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {fmtDate(p.last_called_at)}
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleCall(p)} disabled={callingId === p.id}
                      className="text-slate-600 hover:text-z-blue-light transition-colors disabled:opacity-40" title="Llamar">
                      <PhoneArrowUpRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setHistoryProspect(p)} className="text-slate-600 hover:text-slate-300 transition-colors" title="Historial">
                      <ClockIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(p)} className="text-slate-600 hover:text-red-400 transition-colors" title="Eliminar">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {prospects.length === 0 && (
              <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No hay prospectos</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {showNew && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">Debes crear una campaña antes de agregar prospectos.</p>
                <button onClick={() => setShowNew(false)} className="z-btn-primary">Cerrar</button>
              </div>
            </div>
          : <NewProspectModal campaigns={campaigns} onClose={() => setShowNew(false)}
              onSaved={() => { setShowNew(false); load() }} />
      )}

      {showImport && (
        noCampaigns
          ? <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-z-card border border-z-border rounded-2xl p-8 text-center max-w-sm">
                <p className="text-slate-300 mb-4">Debes crear una campaña antes de importar prospectos.</p>
                <button onClick={() => setShowImport(false)} className="z-btn-primary">Cerrar</button>
              </div>
            </div>
          : <ImportCSVModal campaigns={campaigns} onClose={() => setShowImport(false)}
              onImported={() => { setShowImport(false); load() }} />
      )}

      {showApifySearch && (
        <ApifySearchModal campaigns={campaigns} onClose={() => setShowApifySearch(false)}
          onImported={() => { setShowApifySearch(false); load() }} />
      )}

      {historyProspect && (
        <ProspectHistoryModal prospect={historyProspect} onClose={() => setHistoryProspect(null)} />
      )}
    </div>
  )
}
