import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  MagnifyingGlassIcon, ShieldCheckIcon, SparklesIcon,
  PaperAirplaneIcon, FireIcon, TrashIcon, ChevronDownIcon,
  ChevronUpIcon, ArrowDownTrayIcon, GlobeAltIcon, PhoneIcon,
  StarIcon, ChatBubbleLeftEllipsisIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'
import {
  scoutLeads, getLeadHunterLeads, checkLead, checkAllLeads,
  craftLeadMessage, craftAllLeads, sendLeadMessage,
  updateLeadHunt, deleteLeadHunt, deleteAllLeadHunts,
  getLeadHunterConfig, findEmailByName, findEmailForLead,
} from '../api/client'
import { Link } from 'react-router-dom'
import { exportToCsv } from '../utils/exportCsv'

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
  const { t } = useTranslation()
  if (lead.sent)           return <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/15 text-green-400">{t('leadHunter.statusSent')}</span>
  if (lead.message_es)     return <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/15 text-blue-400">{t('leadHunter.statusMessageReady')}</span>
  if (lead.passed_checks === true)  return <span className="px-2 py-0.5 text-xs rounded-full bg-teal-500/15 text-teal-400">{t('leadHunter.statusVerified')}</span>
  if (lead.passed_checks === false) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-500/15 text-red-400">{t('leadHunter.statusCheckFailed')}</span>
  return <span className="px-2 py-0.5 text-xs rounded-full bg-slate-700/60 text-slate-400">{t('leadHunter.statusUnreviewed')}</span>
}

function IntentLabel({ intent }) {
  const { t } = useTranslation()
  const key = intent === 'positivo' ? 'intentPositive' : intent === 'negativo' ? 'intentNegative' : intent === 'pregunta' ? 'intentQuestion' : null
  return <>{key ? t(`leadHunter.${key}`) : intent}</>
}

export default function LeadHunter() {
  const { t } = useTranslation()
  const FILTER_TABS = [
    { key: 'all',     label: t('leadHunter.tabAll') },
    { key: 'checked', label: t('leadHunter.tabChecked') },
    { key: 'crafted', label: t('leadHunter.tabCrafted') },
    { key: 'sent',    label: t('leadHunter.tabSent') },
    { key: 'hot',     label: t('leadHunter.tabHot') },
  ]

  const [leads, setLeads] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(false)
  const [scouting, setScouting] = useState(false)
  const [scoutForm, setScoutForm] = useState({ limit: 17 })
  const [scoutMsg, setScoutMsg] = useState(null)
  const [lhConfig, setLhConfig] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [actingId, setActingId] = useState(null)   // id of lead being processed
  const [bulkMsg, setBulkMsg] = useState(null)
  const [sendModal, setSendModal] = useState(null)  // lead for send confirmation
  const [replyModal, setReplyModal] = useState(null) // lead for logging reply
  const [emailSearchForm, setEmailSearchForm] = useState({ name: '', city: '' })
  const [emailSearching, setEmailSearching] = useState(false)
  const [emailSearchResult, setEmailSearchResult] = useState(null)
  const [emailSearchError, setEmailSearchError] = useState(null)

  const loadLeads = (f = filter) => {
    setLoading(true)
    const params = f !== 'all' ? { filter: f } : {}
    getLeadHunterLeads(params)
      .then(setLeads)
      .catch(() => setLeads([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadLeads(filter) }, [filter])
  useEffect(() => { getLeadHunterConfig().then(setLhConfig).catch(() => {}) }, [])

  const handleScout = async () => {
    const { limit } = scoutForm
    setScouting(true); setScoutMsg(null)
    try {
      const r = await scoutLeads({ limit: Number(limit) || 17 })
      setScoutMsg({ ok: true, text: t('leadHunter.scoutSuccess', { count: r.found }) })
      setFilter('all')
      loadLeads('all')
    } catch (e) {
      setScoutMsg({ ok: false, text: e.response?.data?.detail || t('leadHunter.scoutError') })
    } finally { setScouting(false) }
  }

  const handleFindEmailByName = async () => {
    if (!emailSearchForm.name.trim()) return
    setEmailSearching(true); setEmailSearchError(null); setEmailSearchResult(null)
    try {
      const r = await findEmailByName(emailSearchForm.name.trim(), emailSearchForm.city.trim())
      setEmailSearchResult(r)
    } catch (e) {
      setEmailSearchError(e.response?.data?.detail || t('leadHunter.genericError'))
    } finally { setEmailSearching(false) }
  }

  const handleFindEmailForLead = async (lead) => {
    setActingId(lead.id)
    try {
      const r = await findEmailForLead(lead.id)
      setLeads(prev => prev.map(l => l.id === lead.id ? r.lead : l))
      if (!r.email) alert(t('leadHunter.findEmailNotFound'))
    } catch (e) { alert(e.response?.data?.detail || t('leadHunter.genericError')) }
    finally { setActingId(null) }
  }

  const handleCheck = async (lead) => {
    setActingId(lead.id)
    try {
      const updated = await checkLead(lead.id)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { alert(e.response?.data?.detail || t('leadHunter.genericError')) }
    finally { setActingId(null) }
  }

  const handleCheckAll = async () => {
    setBulkMsg(null)
    try {
      const r = await checkAllLeads()
      setBulkMsg({ ok: true, text: t('leadHunter.checkAllResult', { checked: r.checked, passed: r.passed, failed: r.failed }) })
      loadLeads()
    } catch (e) { setBulkMsg({ ok: false, text: e.response?.data?.detail || t('leadHunter.genericError') }) }
  }

  const handleCraft = async (lead) => {
    setActingId(lead.id)
    try {
      const updated = await craftLeadMessage(lead.id)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
      setExpanded(lead.id)
    } catch (e) { alert(e.response?.data?.detail || t('leadHunter.generateMessageError')) }
    finally { setActingId(null) }
  }

  const handleCraftAll = async () => {
    setBulkMsg(null)
    try {
      const r = await craftAllLeads()
      setBulkMsg({ ok: true, text: t('leadHunter.craftAllResult', { count: r.crafted }) + (r.errors ? t('leadHunter.craftAllErrors', { count: r.errors }) : '') })
      loadLeads()
    } catch (e) { setBulkMsg({ ok: false, text: e.response?.data?.detail || t('leadHunter.genericError') }) }
  }

  const handleSend = async (lead, channel) => {
    setSendModal(null)
    setActingId(lead.id)
    try {
      const updated = await sendLeadMessage(lead.id, channel)
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { alert(e.response?.data?.detail || t('leadHunter.sendError')) }
    finally { setActingId(null) }
  }

  const handleToggleHot = async (lead) => {
    try {
      const updated = await updateLeadHunt(lead.id, { is_hot: !lead.is_hot })
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
    } catch (e) { /* silent */ }
  }

  const handleDelete = async (lead) => {
    if (!confirm(t('leadHunter.confirmDelete', { name: lead.name }))) return
    try {
      await deleteLeadHunt(lead.id)
      setLeads(prev => prev.filter(l => l.id !== lead.id))
    } catch (e) { alert(t('leadHunter.confirmDeleteError')) }
  }

  const handleDeleteAll = async () => {
    if (!confirm(t('leadHunter.confirmDeleteAll'))) return
    try {
      await deleteAllLeadHunts()
      setLeads([])
    } catch (e) { alert(t('leadHunter.confirmDeleteError')) }
  }

  const handleSaveReply = async (lead, reply, intent) => {
    try {
      const updated = await updateLeadHunt(lead.id, { reply, reply_intent: intent })
      setLeads(prev => prev.map(l => l.id === lead.id ? updated : l))
      setReplyModal(null)
    } catch (e) { alert(t('leadHunter.saveError')) }
  }

  const handleExport = () => {
    exportToCsv(`lead-hunter-${Date.now()}.csv`, leads, [
      { key: 'name',          label: t('leadHunter.headers.business') },
      { key: 'city',          label: t('leadHunter.headers.city') },
      { key: 'category',      label: 'Categoría' },
      { key: 'phone',         label: 'Teléfono' },
      { key: 'rating',        label: t('leadHunter.headers.rating') },
      { key: 'reviews_count', label: t('leadHunter.headers.reviews') },
      { key: 'website_url',   label: 'Web' },
      { key: 'pain_point',    label: t('leadHunter.painPoint') },
      { key: 'message_es',    label: t('leadHunter.messageEs') },
      { key: 'sent',          label: t('leadHunter.statusSent') },
      { key: 'reply',         label: t('leadHunter.replyText') },
      { key: 'reply_intent',  label: t('leadHunter.intent') },
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
            <MagnifyingGlassIcon className="w-6 h-6 text-blue-400" /> {t('leadHunter.title')}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('leadHunter.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          {leads.length > 0 && (
            <>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {t('leadHunter.export')}
              </button>
              <button onClick={handleDeleteAll}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400/70 border border-red-500/20 rounded-lg hover:bg-red-500/10 transition-colors">
                <TrashIcon className="w-3.5 h-3.5" /> {t('leadHunter.clearAll')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Config banner */}
      {lhConfig && (
        <div className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${lhConfig.lh_active ? 'bg-blue-500/5 border-blue-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <div className="text-xs space-y-0.5 min-w-0">
            {lhConfig.lh_active ? (
              <>
                <p className="text-slate-300 font-medium">
                  {t('leadHunter.searchingLabel')}: <span className="text-blue-400">{lhConfig.lh_target_description || '—'}</span>
                </p>
                <p className="text-slate-500">
                  {t('leadHunter.citiesLabel')}: {lhConfig.lh_cities || '—'} · {t('leadHunter.languageLabel')}: {lhConfig.lh_language === 'both' ? 'ES + EN' : (lhConfig.lh_language || 'es').toUpperCase()}
                </p>
              </>
            ) : (
              <p className="text-amber-400 font-medium">{t('leadHunter.inactiveWarning')}</p>
            )}
          </div>
          <Link to="/lead-hunter/config"
            className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-z-border text-slate-400 hover:bg-white/5 transition-colors whitespace-nowrap">
            {t('leadHunter.configureBtn')}
          </Link>
        </div>
      )}

      {/* Scout form */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <MagnifyingGlassIcon className="w-4 h-4 text-blue-400" /> {t('leadHunter.searchBusinesses')}
        </h2>
        <div className="max-w-xs">
          <label className="text-xs text-slate-500 mb-1 block">{t('leadHunter.resultLimit')}</label>
          <input
            type="number" min={1} max={50} value={scoutForm.limit}
            onChange={e => setScoutForm(p => ({ ...p, limit: e.target.value }))}
            className="z-input w-full text-sm"
          />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleScout}
            disabled={scouting || !lhConfig?.lh_active}
            className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {scouting
              ? <><span className="animate-spin text-base">⟳</span> {t('leadHunter.searching')}</>
              : <><MagnifyingGlassIcon className="w-4 h-4" /> {t('leadHunter.searchLeads')}</>
            }
          </button>
          {!lhConfig?.lh_active && !scouting && (
            <p className="text-xs text-amber-400">{t('leadHunter.activateFirst')} <Link to="/lead-hunter/config" className="underline">{t('leadHunter.configuration')}</Link> {t('leadHunter.activateFirstSuffix')}</p>
          )}
          {scouting && <p className="text-xs text-slate-500 animate-pulse">{t('leadHunter.searchingHint')}</p>}
          {scoutMsg && (
            <p className={`text-xs font-medium ${scoutMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {scoutMsg.ok ? '✓' : '✗'} {scoutMsg.text}
            </p>
          )}
        </div>
        <p className="text-xs text-slate-600">
          {t('leadHunter.aiSearchHint')}
        </p>
      </div>

      {/* Find email by company name */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <EnvelopeIcon className="w-4 h-4 text-blue-400" /> {t('leadHunter.findEmailTitle')}
        </h2>
        <p className="text-xs text-slate-600">{t('leadHunter.findEmailHint')}</p>
        <div className="flex items-end gap-3 flex-wrap">
          <div className="max-w-xs flex-1 min-w-[180px]">
            <input
              type="text" value={emailSearchForm.name}
              onChange={e => setEmailSearchForm(p => ({ ...p, name: e.target.value }))}
              placeholder={t('leadHunter.findEmailNamePlaceholder')}
              className="z-input w-full text-sm"
            />
          </div>
          <div className="max-w-[200px] flex-1 min-w-[140px]">
            <input
              type="text" value={emailSearchForm.city}
              onChange={e => setEmailSearchForm(p => ({ ...p, city: e.target.value }))}
              placeholder={t('leadHunter.findEmailCityPlaceholder')}
              className="z-input w-full text-sm"
            />
          </div>
          <button
            onClick={handleFindEmailByName}
            disabled={emailSearching || !emailSearchForm.name.trim()}
            className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            {emailSearching
              ? <><span className="animate-spin text-base">⟳</span> {t('leadHunter.findEmailSearching')}</>
              : <><EnvelopeIcon className="w-4 h-4" /> {t('leadHunter.findEmailBtn')}</>
            }
          </button>
        </div>

        {emailSearchError && (
          <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{emailSearchError}</p>
        )}

        {emailSearchResult && (
          <div className="border border-z-border rounded-lg p-4 text-xs space-y-2">
            {emailSearchResult.matched_name && (
              <p className="text-slate-300 font-medium">{emailSearchResult.matched_name}</p>
            )}
            {emailSearchResult.website && (
              <a href={emailSearchResult.website} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:underline w-fit">
                <GlobeAltIcon className="w-3.5 h-3.5" /> {emailSearchResult.website}
              </a>
            )}
            {emailSearchResult.email ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-slate-200">{emailSearchResult.email}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                  emailSearchResult.source === 'scraped' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'
                }`}>
                  {emailSearchResult.source === 'scraped' ? t('leadHunter.findEmailScraped') : t('leadHunter.findEmailGuessed')}
                </span>
              </div>
            ) : emailSearchResult.website ? (
              <p className="text-amber-400">{t('leadHunter.findEmailNoDomainMail')}</p>
            ) : (
              <p className="text-slate-500">{t('leadHunter.findEmailNotFoundAtAll')}</p>
            )}
            {emailSearchResult.candidates?.length > 1 && (
              <div>
                <p className="text-slate-500 uppercase font-medium mt-2 mb-1">{t('leadHunter.findEmailOtherCandidates')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {emailSearchResult.candidates.slice(1).map(c => (
                    <span key={c} className="font-mono text-slate-400 bg-black/20 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
            )}
            {/* Algorithmic guesses shown alongside a real scraped email, so
                there's always more than one address to try. */}
            {emailSearchResult.source === 'scraped' && emailSearchResult.guessed_candidates?.length > 0 && (
              <div>
                <p className="text-amber-400/80 uppercase font-medium mt-2 mb-1">{t('leadHunter.findEmailAlgoSuggestions')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {emailSearchResult.guessed_candidates.map(c => (
                    <span key={c} className="font-mono text-amber-300/80 bg-amber-500/10 rounded px-1.5 py-0.5">{c}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Stats bar */}
      {total > 0 && (
        <div className="grid grid-cols-5 gap-2">
          {[
            { label: t('leadHunter.statTotal'), value: total,   color: 'text-slate-300' },
            { label: t('leadHunter.statChecked'), value: checked, color: 'text-teal-400' },
            { label: t('leadHunter.statCrafted'), value: crafted, color: 'text-blue-400' },
            { label: t('leadHunter.statSent'),    value: sent,    color: 'text-green-400' },
            { label: t('leadHunter.statHot'),   value: hot,     color: 'text-amber-400' },
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
          <span className="text-xs text-slate-500">{t('leadHunter.bulkActionsLabel')}</span>
          <button onClick={handleCheckAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-teal-400 border border-teal-500/30 rounded-lg hover:bg-teal-500/10 transition-colors">
            <ShieldCheckIcon className="w-3.5 h-3.5" /> {t('leadHunter.checkAll')}
          </button>
          <button onClick={handleCraftAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-400 border border-blue-500/30 rounded-lg hover:bg-blue-500/10 transition-colors">
            <SparklesIcon className="w-3.5 h-3.5" /> {t('leadHunter.craftAll')}
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
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-4 py-3 text-xs font-medium whitespace-nowrap transition-colors ${
                  filter === tab.key
                    ? 'text-blue-400 border-b-2 border-blue-400 bg-blue-500/5'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-black/20">
                <tr>
                  {[t('leadHunter.headers.business'), t('leadHunter.headers.city'), t('leadHunter.headers.rating'), t('leadHunter.headers.reviews'), t('leadHunter.headers.phoneWeb'), t('leadHunter.headers.status'), t('leadHunter.headers.actions')].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500 animate-pulse">{t('leadHunter.loadingLeads')}</td></tr>
                ) : leads.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-600 text-sm">{t('leadHunter.noLeadsInView')}</td></tr>
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
                          {lead.email && (
                            <div className="flex items-center gap-1 text-xs text-slate-300 truncate max-w-[160px]" title={lead.email}>
                              <EnvelopeIcon className={`w-3 h-3 flex-shrink-0 ${lead.email_source === 'scraped' ? 'text-green-400' : 'text-amber-400'}`} />
                              {lead.email}
                            </div>
                          )}
                          {!lead.phone && !lead.website_url && !lead.email && <span className="text-slate-600 text-xs">—</span>}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <StatusPill lead={lead} />
                          {lead.reply_intent && (
                            <span className={`px-2 py-0.5 text-xs rounded-full ${INTENT_COLORS[lead.reply_intent] || 'bg-slate-700 text-slate-400'}`}>
                              <IntentLabel intent={lead.reply_intent} />
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
                            title={expanded === lead.id ? t('leadHunter.collapse') : t('leadHunter.viewDetail')}
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
                              title={t('leadHunter.verifyQuality')}
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
                              title={t('leadHunter.generateMessageAi')}
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
                              title={t('leadHunter.sendMessage')}
                            >
                              <PaperAirplaneIcon className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Log reply */}
                          {lead.sent && (
                            <button
                              onClick={() => setReplyModal({ ...lead })}
                              className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors"
                              title={t('leadHunter.logReply')}
                            >
                              <ChatBubbleLeftEllipsisIcon className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Find email */}
                          {!lead.email && (
                            <button
                              onClick={() => handleFindEmailForLead(lead)}
                              disabled={actingId === lead.id}
                              className="p-1.5 text-amber-400 hover:text-amber-300 transition-colors disabled:opacity-40"
                              title={t('leadHunter.findEmailForLead')}
                            >
                              {actingId === lead.id
                                ? <span className="text-xs animate-spin inline-block">⟳</span>
                                : <EnvelopeIcon className="w-3.5 h-3.5" />
                              }
                            </button>
                          )}

                          {/* Hot toggle */}
                          <button
                            onClick={() => handleToggleHot(lead)}
                            className={`p-1.5 transition-colors ${lead.is_hot ? 'text-amber-400' : 'text-slate-600 hover:text-amber-400'}`}
                            title={lead.is_hot ? t('leadHunter.removeHot') : t('leadHunter.markHot')}
                          >
                            <FireIcon className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(lead)}
                            className="p-1.5 text-slate-600 hover:text-red-400 transition-colors"
                            title={t('leadHunter.delete')}
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
                              <p className="text-slate-500 uppercase font-medium mb-1">{t('leadHunter.painPoint')}</p>
                              {lead.pain_point
                                ? <p className="text-slate-300 leading-relaxed">{lead.pain_point}</p>
                                : <p className="text-slate-600 italic">{t('leadHunter.notGeneratedYet')}</p>
                              }
                            </div>
                            {/* Message ES */}
                            <div>
                              <p className="text-slate-500 uppercase font-medium mb-1">{t('leadHunter.messageEs')}</p>
                              {lead.message_es
                                ? <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.message_es}</p>
                                : <p className="text-slate-600 italic">{t('leadHunter.notGeneratedYet')}</p>
                              }
                            </div>
                            {/* Message EN */}
                            <div>
                              <p className="text-slate-500 uppercase font-medium mb-1">{t('leadHunter.messageEn')}</p>
                              {lead.message_en
                                ? <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{lead.message_en}</p>
                                : <p className="text-slate-600 italic">{t('leadHunter.notGeneratedYetEn')}</p>
                              }
                            </div>
                            {/* Email */}
                            {lead.email && (
                              <div className="sm:col-span-3">
                                <p className="text-slate-500 uppercase font-medium mb-1">Email</p>
                                <p className="text-slate-300 font-mono">
                                  {lead.email}{' '}
                                  <span className={lead.email_source === 'scraped' ? 'text-green-400' : 'text-amber-400'}>
                                    ({lead.email_source === 'scraped' ? t('leadHunter.emailSourceScraped') : t('leadHunter.emailSourceGuessed')})
                                  </span>
                                </p>
                              </div>
                            )}
                            {/* Reply if any */}
                            {lead.reply && (
                              <div className="sm:col-span-3">
                                <p className="text-slate-500 uppercase font-medium mb-1">{t('leadHunter.prospectReply')}</p>
                                <p className="text-slate-300 italic">"{lead.reply}"</p>
                              </div>
                            )}
                            {/* Check reason */}
                            {lead.check_reason && (
                              <div className="sm:col-span-3">
                                <p className="text-slate-500 uppercase font-medium mb-1">{t('leadHunter.checkReason')}</p>
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
                                ? <><span className="animate-spin">⟳</span> {t('leadHunter.generatingMessage')}</>
                                : <><SparklesIcon className="w-3.5 h-3.5" /> {t('leadHunter.generateMessageAi')}</>
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
          <p className="text-slate-400 font-medium">{t('leadHunter.emptyTitle')}</p>
          <p className="text-xs text-slate-600 mt-1">{t('leadHunter.emptyHint')}</p>
        </div>
      )}

      {/* Send confirmation modal */}
      {sendModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-100">{t('leadHunter.confirmSendTitle')}</h2>
            <div className="space-y-2">
              <p className="text-sm text-slate-300">
                {t('leadHunter.sendMessageTo')} <span className="font-semibold text-slate-100">{sendModal.name}</span>
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
                <PaperAirplaneIcon className="w-4 h-4" /> {t('leadHunter.sendWhatsapp')}
              </button>
              <button onClick={() => setSendModal(null)} className="z-btn-ghost text-sm">{t('leadHunter.cancel')}</button>
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
  const { t } = useTranslation()
  const [reply, setReply] = useState(lead.reply || '')
  const [intent, setIntent] = useState(lead.reply_intent || '')

  const INTENT_OPTIONS = ['positivo', 'negativo', 'pregunta']

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-100">{t('leadHunter.logReplyTitle')}</h2>
        <p className="text-xs text-slate-500">{lead.name}</p>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">{t('leadHunter.replyText')}</label>
          <textarea
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={3}
            placeholder={t('leadHunter.replyPlaceholder')}
            className="z-input w-full text-sm resize-none"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">{t('leadHunter.intent')}</label>
          <div className="flex gap-2">
            {INTENT_OPTIONS.map(opt => (
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
                <IntentLabel intent={opt} />
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
            {t('leadHunter.save')}
          </button>
          <button onClick={onClose} className="z-btn-ghost text-sm">{t('leadHunter.cancel')}</button>
        </div>
      </div>
    </div>
  )
}
