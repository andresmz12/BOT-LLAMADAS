import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import { UserGroupIcon, StarIcon, CalendarIcon, XCircleIcon, ClockIcon, PhoneArrowDownLeftIcon, ArrowPathIcon, EnvelopeIcon, CursorArrowRaysIcon, ArrowTrendingUpIcon, NoSymbolIcon } from '@heroicons/react/24/outline'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns, getOrganizations, getEmailStats, getEmailEvents, downloadEmailStatsPdf } from '../api/client'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { fmtDate } from '../utils/date'

const TOOLTIP_STYLE = { background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }

// Outcome → color keyed by meaning (not array position), so "interesado" is
// always green and "no interesado" always red regardless of which outcomes
// happen to be present in a given org's data — mirrors StatusBadge's palette.
const OUTCOME_COLOR = {
  interested: '#10b981',
  not_interested: '#ef4444',
  callback_requested: '#3b82f6',
  appointment_scheduled: '#2563EB',
  voicemail: '#8b5cf6',
  wrong_number: '#f97316',
  do_not_call: '#dc2626',
  no_answer: '#64748b',
  failed: '#64748b',
}
const OUTCOME_FALLBACK = '#94a3b8'

function initials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return ((parts[0][0] || '') + (parts[1]?.[0] || parts[0][1] || '')).toUpperCase()
}

/* ---------------------------- Shared shells ---------------------------- */

function Panel({ title, subtitle, action, children, noPad = false, className = '' }) {
  return (
    <div className={`bg-z-card rounded-2xl border border-z-border overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-4 border-b border-white/[0.04]">
          <div>
            {title && <h2 className="font-display text-sm font-bold text-slate-100">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={noPad ? '' : 'p-5'}>{children}</div>
    </div>
  )
}

function SegmentedTabs({ tabs, active, onChange }) {
  return (
    <div className="inline-flex p-1 gap-1.5 bg-z-card border border-z-border rounded-xl">
      {tabs.map(tb => (
        <button
          key={tb.key}
          onClick={() => onChange(tb.key)}
          className={`px-6 py-2 text-sm font-semibold rounded-lg whitespace-nowrap transition-colors ${
            active === tb.key
              ? 'text-white bg-gradient-to-br from-z-blue-light to-z-blue shadow-lg shadow-z-blue/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {tb.label}
        </button>
      ))}
    </div>
  )
}

function HeroWave() {
  const bars = [
    [0, 22, 34], [10, 14, 42], [20, 4, 50], [30, 18, 40], [40, 10, 46],
    [50, 0, 52], [60, 14, 44], [70, 24, 36], [80, 6, 48], [90, 20, 38],
  ]
  return (
    <svg className="absolute right-[-6px] bottom-[-10px] w-40 h-16 opacity-40 pointer-events-none" viewBox="0 0 100 56" fill="none" aria-hidden="true">
      <g stroke="#3B82F6" strokeWidth="3" strokeLinecap="round">
        {bars.map(([x, y1, y2], i) => <line key={i} x1={x} y1={y1} x2={x} y2={y2} />)}
      </g>
    </svg>
  )
}

function HeroCard({ label, value, live, children }) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-z-border p-5 flex flex-col justify-between min-h-[164px]"
      style={{ background: 'linear-gradient(150deg, #141d31, #111827 65%)' }}
    >
      <HeroWave />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</span>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold text-green-400 bg-green-500/10 rounded-full pl-1.5 pr-2 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {live}
          </span>
        )}
      </div>
      <div className="relative z-10">
        <div className="font-mono text-[42px] font-semibold leading-none tabular-nums">{value}</div>
        {children}
      </div>
    </div>
  )
}

function StatCard({ title, value, sub, valueColor = 'text-slate-100', icon: Icon, iconBg = 'bg-white/5', iconColor = 'text-slate-400' }) {
  return (
    <div className="bg-z-card rounded-2xl border border-z-border p-4 flex flex-col justify-between min-h-[164px]">
      <div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2.5 ${iconBg} ${iconColor}`}>
          {Icon && <Icon className="w-4 h-4" />}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      </div>
      <div>
        <p className={`font-mono text-[26px] font-semibold tabular-nums ${valueColor}`}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function StripTile({ title, value, icon: Icon, valueColor = 'text-slate-100' }) {
  return (
    <div className="bg-z-card rounded-xl border border-z-border p-3.5 flex items-center gap-3">
      <div className="w-[30px] h-[30px] rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 text-slate-400">
        {Icon && <Icon className="w-[15px] h-[15px]" />}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 truncate">{title}</p>
        <p className={`font-mono text-lg font-semibold tabular-nums ${valueColor}`}>{value}</p>
      </div>
    </div>
  )
}

function FunnelBars({ data }) {
  const max = Math.max(1, ...data.map(d => d.value))
  const COLORS = ['#334155', '#2563EB', '#3B82F6', '#10b981']
  return (
    <div className="space-y-3">
      {data.map((d, i) => (
        <div key={d.name} className="grid grid-cols-[92px_1fr_44px] items-center gap-3">
          <span className="text-xs text-slate-400 font-medium truncate">{d.name}</span>
          <div className="h-[22px] rounded-lg bg-black/30 overflow-hidden">
            <div
              className="h-full rounded-lg transition-all duration-500"
              style={{ width: `${Math.max(d.value ? 4 : 0, Math.round((d.value / max) * 100))}%`, background: COLORS[i % COLORS.length] }}
            />
          </div>
          <span className="font-mono text-sm font-bold text-right tabular-nums">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

function HourBars({ data, peakHour }) {
  const max = Math.max(1, ...data.map(h => h.calls))
  const step = Math.max(1, Math.ceil(data.length / 6))
  return (
    <div>
      <div className="flex items-end gap-[3px] h-24">
        {data.map((h, i) => {
          const isPeak = peakHour != null && h.hour === peakHour
          return (
            <div
              key={h.hour}
              className="flex-1 relative rounded-t-sm"
              style={{
                height: `${Math.max(h.calls ? 6 : 2, Math.round((h.calls / max) * 100))}%`,
                background: isPeak ? '#3B82F6' : `rgba(37,99,235,${0.18 + (h.contact_rate / 100) * 0.55})`,
              }}
            >
              {isPeak && <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-green-400" />}
            </div>
          )
        })}
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-slate-600">
        {data.filter((_, i) => i % step === 0).map(h => <span key={h.hour}>{h.hour}h</span>)}
      </div>
    </div>
  )
}

/* ------------------------------ Email tab ------------------------------ */

function EmailDashboard({ selectedOrg }) {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es'
  const TEMPLATE_LABELS = {
    interested: t('dashboard.email.templateInterested'),
    callback_requested: t('dashboard.email.templateCallback'),
    voicemail: t('dashboard.email.templateVoicemail'),
    not_interested: t('dashboard.email.templateNotInterested'),
    general: t('dashboard.email.templateGeneral'),
  }
  const [es, setEs] = useState(null)
  const [trackingTab, setTrackingTab] = useState('all')
  const [trackingEvents, setTrackingEvents] = useState(null)
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  useEffect(() => {
    getEmailStats().then(setEs).catch(() => {})
  }, [selectedOrg])

  const handleDownloadPdf = async () => {
    setPdfLoading(true)
    try { await downloadEmailStatsPdf() }
    catch (e) { alert(t('dashboard.email.pdfError')) }
    finally { setPdfLoading(false) }
  }

  const loadTracking = async () => {
    setTrackingLoading(true)
    try { const r = await getEmailEvents(); setTrackingEvents(r.events || []) }
    catch (_) { setTrackingEvents([]) }
    finally { setTrackingLoading(false) }
  }

  const exportTracking = () => {
    if (!trackingEvents?.length) return
    const LABEL = { delivered: t('dashboard.email.eventDelivered'), open: t('dashboard.email.eventOpen'), click: t('dashboard.email.eventClick'), bounce: t('dashboard.email.eventBounce'), dropped: t('dashboard.email.eventDropped'), unsubscribe: t('dashboard.email.eventUnsubscribe'), spamreport: t('dashboard.email.eventSpamreport') }
    const rows = (trackingTab === 'all' ? trackingEvents : trackingEvents.filter(e => e.event_type === trackingTab))
      .map(e => ({ 'Email': e.email, 'Evento': LABEL[e.event_type] || e.event_type, 'Plantilla': e.template_key || '', 'URL': e.url || '', 'Fecha': e.timestamp ? new Date(e.timestamp).toLocaleString(dateLocale) : '' }))
    import('xlsx').then(XLSX => {
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Tracking')
      XLSX.writeFile(wb, `email-tracking-${new Date().toISOString().slice(0,10)}.xlsx`)
    })
  }

  const noData = !es || es.total_sent === 0

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-sm font-bold text-slate-200">{t('dashboard.email.metricsTitle')}</h2>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || noData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-z-border rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          {pdfLoading ? t('dashboard.email.generatingPdf') : t('dashboard.email.downloadPdf')}
        </button>
      </div>

      {/* Hero + secondary tier */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="col-span-2">
          <HeroCard label={t('dashboard.email.kpiSent')} value={es?.total_sent ?? 0} />
        </div>
        <StatCard title={t('dashboard.email.kpiDelivered')} value={es?.delivered ?? 0}
          sub={es?.delivery_rate != null ? `${es.delivery_rate}%` : undefined}
          valueColor="text-green-400" icon={ArrowTrendingUpIcon} iconBg="bg-green-500/10" iconColor="text-green-400" />
        <StatCard title={t('dashboard.email.kpiOpened')} value={es?.unique_opens ?? 0}
          sub={es?.open_rate != null ? t('dashboard.email.kpiOpenRate', { rate: es.open_rate }) : undefined}
          valueColor="text-blue-400" icon={EnvelopeIcon} iconBg="bg-blue-500/10" iconColor="text-blue-400" />
        <StatCard title={t('dashboard.email.kpiClicks')} value={es?.unique_clicks ?? 0}
          sub={es?.click_rate != null ? t('dashboard.email.kpiClickRate', { rate: es.click_rate }) : undefined}
          valueColor="text-purple-400" icon={CursorArrowRaysIcon} iconBg="bg-purple-500/10" iconColor="text-purple-400" />
      </div>

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-2">{t('dashboard.otherMetrics')}</p>
        <div className="grid grid-cols-2 gap-3 max-w-md">
          <StripTile title={t('dashboard.email.kpiBounced')} value={es?.bounces ?? 0} icon={XCircleIcon} valueColor="text-red-400" />
          <StripTile title={t('dashboard.email.kpiUnsubscribed')} value={es?.unsubscribes ?? 0} icon={NoSymbolIcon} valueColor="text-slate-400" />
        </div>
      </div>

      {noData ? (
        <Panel>
          <div className="text-center py-4">
            <EnvelopeIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400 font-medium">{t('dashboard.email.noDataTitle')}</p>
            <p className="text-slate-600 text-sm mt-1">{t('dashboard.email.noDataHint')}</p>
          </div>
        </Panel>
      ) : (
        <>
          <Panel title={t('dashboard.email.activityLast7Days')}>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={es?.by_day || []}>
                <defs>
                  <linearGradient id="egSent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#475569" stopOpacity={0.35} /><stop offset="95%" stopColor="#475569" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="egDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="egOpens" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="egClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.5} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                <Area type="monotone" dataKey="sent" name={t('dashboard.email.chartSent')} stroke="#64748b" strokeWidth={2} fill="url(#egSent)" />
                <Area type="monotone" dataKey="delivered" name={t('dashboard.email.chartDelivered')} stroke="#2563EB" strokeWidth={2} fill="url(#egDelivered)" />
                <Area type="monotone" dataKey="opens" name={t('dashboard.email.chartOpens')} stroke="#10b981" strokeWidth={2} fill="url(#egOpens)" />
                <Area type="monotone" dataKey="clicks" name={t('dashboard.email.chartClicks')} stroke="#8b5cf6" strokeWidth={2} fill="url(#egClicks)" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {es?.by_template?.length > 0 && (() => {
              // Busy orgs can accumulate dozens of one-off/custom template
              // keys (each resend, test send, etc. can mint its own) — an
              // unbounded table turns into a page-breaking wall of rows, so
              // show the most-sent templates first and cap what's rendered.
              const TEMPLATE_ROWS_CAP = 8
              const sorted = [...es.by_template].sort((a, b) => b.sent - a.sent)
              const visible = sorted.slice(0, TEMPLATE_ROWS_CAP)
              const hiddenCount = sorted.length - visible.length
              return (
                <Panel title={t('dashboard.email.byTemplate')} noPad>
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead className="bg-black/20">
                      <tr>
                        {[t('dashboard.email.templateHeaders.template'), t('dashboard.email.templateHeaders.sent'), t('dashboard.email.templateHeaders.delivered'), t('dashboard.email.templateHeaders.openRate'), t('dashboard.email.templateHeaders.clickRate')].map(h => (
                          <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-z-border">
                      {visible.map(tpl => (
                        <tr key={tpl.key} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-slate-200 truncate max-w-[220px]">{tpl.label || TEMPLATE_LABELS[tpl.key] || tpl.key}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-slate-300">{tpl.sent}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-green-400">{tpl.delivered}</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-blue-400">{tpl.open_rate}%</td>
                          <td className="px-4 py-3 font-mono tabular-nums text-purple-400">{tpl.click_rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {hiddenCount > 0 && (
                    <p className="px-4 py-2.5 text-xs text-slate-600 border-t border-white/[0.04]">
                      {t('dashboard.email.moreTemplates', { count: hiddenCount })}
                    </p>
                  )}
                </Panel>
              )
            })()}

            {es?.recent_sends?.length > 0 && (
              <Panel title={t('dashboard.email.recentSends')} noPad>
                <div className="divide-y divide-z-border">
                  {es.recent_sends.map((s, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 font-medium truncate">
                          {s.template_label || TEMPLATE_LABELS[s.template_key] || s.template_key}
                          {s.campaign_name && <span className="text-slate-500 font-normal"> · {s.campaign_name}</span>}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDate(s.sent_at)}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className="font-mono tabular-nums text-green-400 font-semibold">{t('dashboard.email.sentCount', { count: s.total_sent })}</span>
                        {s.total_errors > 0 && <span className="font-mono tabular-nums text-red-400">{t('dashboard.email.errorsCount', { count: s.total_errors })}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            )}
          </div>
        </>
      )}

      {/* Seguimiento individual de emails */}
      <Panel
        title={t('dashboard.email.trackingTitle')}
        subtitle={t('dashboard.email.trackingSubtitle')}
        noPad
        action={
          <div className="flex items-center gap-2">
            {trackingEvents !== null && (
              <button onClick={exportTracking} disabled={!trackingEvents.length}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 border border-green-400/30 rounded-lg hover:bg-green-400/10 transition-colors disabled:opacity-40">
                <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {t('dashboard.email.exportExcel')}
              </button>
            )}
            {trackingEvents === null ? (
              <button onClick={loadTracking} disabled={trackingLoading}
                className="px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors disabled:opacity-50">
                {trackingLoading ? t('dashboard.email.loadingEvents') : t('dashboard.email.loadEvents')}
              </button>
            ) : (
              <button onClick={loadTracking} disabled={trackingLoading}
                className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                {trackingLoading ? '...' : '↻'}
              </button>
            )}
          </div>
        }
      >
        {trackingEvents !== null && (
          <>
            {(() => {
              const TABS = [
                { key: 'all', label: t('dashboard.email.tabAll') },
                { key: 'delivered', label: t('dashboard.email.tabDelivered'), color: 'text-green-400' },
                { key: 'open', label: t('dashboard.email.tabOpen'), color: 'text-blue-400' },
                { key: 'click', label: t('dashboard.email.tabClick'), color: 'text-purple-400' },
                { key: 'bounce', label: t('dashboard.email.tabBounce'), color: 'text-red-400' },
                { key: 'unsubscribe', label: t('dashboard.email.tabUnsubscribe'), color: 'text-amber-400' },
              ]
              const counts = {}
              trackingEvents.forEach(e => { counts[e.event_type] = (counts[e.event_type] || 0) + 1 })
              const LABEL = { delivered: t('dashboard.email.eventDelivered'), open: t('dashboard.email.eventOpen'), click: t('dashboard.email.eventClick'), bounce: t('dashboard.email.eventBounce'), dropped: t('dashboard.email.eventDropped'), unsubscribe: t('dashboard.email.eventUnsubscribe'), spamreport: t('dashboard.email.eventSpamreport') }
              const BADGE = { delivered: 'bg-green-500/15 text-green-400', open: 'bg-blue-500/15 text-blue-400', click: 'bg-purple-500/15 text-purple-400', bounce: 'bg-red-500/15 text-red-400', dropped: 'bg-red-500/15 text-red-400', unsubscribe: 'bg-amber-500/15 text-amber-400', spamreport: 'bg-orange-500/15 text-orange-400' }
              const filtered = trackingTab === 'all' ? trackingEvents : trackingEvents.filter(e => e.event_type === trackingTab)
              return (
                <>
                  <div className="flex gap-1 px-4 py-3 border-b border-z-border flex-wrap">
                    {TABS.map(tab => {
                      const count = tab.key === 'all' ? trackingEvents.length : (counts[tab.key] || 0)
                      return (
                        <button key={tab.key} onClick={() => setTrackingTab(tab.key)}
                          className={`px-3 py-1 text-xs rounded-lg border transition-colors ${trackingTab === tab.key ? 'bg-white/10 border-slate-500/60 text-slate-200' : 'border-z-border text-slate-500 hover:bg-white/5'}`}>
                          {tab.label}
                          {count > 0 && <span className={`ml-1.5 font-mono font-bold ${trackingTab === tab.key ? 'text-slate-300' : (tab.color || 'text-slate-400')}`}>{count}</span>}
                        </button>
                      )
                    })}
                  </div>
                  {filtered.length === 0 ? (
                    <p className="text-center text-slate-600 text-sm py-10">
                      {trackingTab === 'all' ? t('dashboard.email.noEventsYet') : t('dashboard.email.noEventsOfType')}
                    </p>
                  ) : (
                    <div className="overflow-x-auto max-h-80 overflow-y-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-black/20 sticky top-0">
                          <tr>
                            {[t('dashboard.email.trackingHeaders.email'), t('dashboard.email.trackingHeaders.event'), t('dashboard.email.trackingHeaders.template'), t('dashboard.email.trackingHeaders.url'), t('dashboard.email.trackingHeaders.date')].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-z-border">
                          {filtered.map(ev => (
                            <tr key={ev.id} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-2 font-mono text-slate-300 max-w-[180px] truncate">{ev.email}</td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[ev.event_type] || 'bg-slate-500/15 text-slate-400'}`}>
                                  {LABEL[ev.event_type] || ev.event_type}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-slate-500">{ev.template_key || '—'}</td>
                              <td className="px-4 py-2 max-w-[180px] truncate">
                                {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">{ev.url}</a> : <span className="text-slate-700">—</span>}
                              </td>
                              <td className="px-4 py-2 font-mono text-slate-500 whitespace-nowrap">
                                {ev.timestamp ? new Date(ev.timestamp).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )
            })()}
          </>
        )}

        {trackingEvents === null && !trackingLoading && (
          <p className="text-center text-slate-600 text-xs py-6">{t('dashboard.email.loadEventsHint')}</p>
        )}
      </Panel>
    </div>
  )
}

/* -------------------------------- Calls tab ------------------------------ */

export default function Dashboard() {
  const { t } = useTranslation()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isSuperAdmin = user.role === 'superadmin'
  const firstName = (user.full_name || '').trim().split(/\s+/)[0] || null

  const [tab, setTab] = useState('calls')
  const [stats, setStats] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [orgs, setOrgs] = useState([])
  const [selectedOrg, setSelectedOrg] = useState('')

  useEffect(() => {
    getCampaigns().then(setCampaigns).catch(() => {})
    if (isSuperAdmin) getOrganizations().then(setOrgs).catch(() => {})
  }, [])

  useEffect(() => {
    const params = selectedOrg ? { organization_id: selectedOrg } : undefined
    getStats(params).then(setStats).catch(() => {})
  }, [selectedOrg])

  const fmtDur = (s) => s ? (s >= 60 ? `${Math.floor(s/60)}m ${s%60}s` : `${s}s`) : '—'

  const hour = new Date().getHours()
  const greetingKey = hour < 12 ? 'dashboard.greetingMorning' : hour < 19 ? 'dashboard.greetingAfternoon' : 'dashboard.greetingEvening'

  const funnelData = stats ? [
    { name: t('dashboard.totalCalls'), value: stats.total_calls ?? 0 },
    { name: t('dashboard.contacted'), value: stats.contacted ?? 0 },
    { name: t('dashboard.interested'), value: stats.interested ?? 0 },
    { name: t('dashboard.appointments'), value: stats.appointments ?? 0 },
  ] : []

  const bestHour = stats?.calls_by_hour?.length
    ? stats.calls_by_hour.reduce((best, h) => h.contact_rate > best.contact_rate ? h : best, stats.calls_by_hour[0])
    : null

  const outcomeTotal = (stats?.outcome_distribution || []).reduce((sum, d) => sum + d.value, 0)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11.5px] font-semibold text-slate-600 uppercase tracking-[.09em] mb-1">{t('dashboard.title')} · ZyraVoice</p>
          <h1 className="font-display text-2xl font-extrabold text-slate-100 leading-tight">
            {firstName ? t(greetingKey, { name: firstName }) : t('dashboard.title')}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{t('dashboard.subtitle')}</p>
        </div>
        {isSuperAdmin && orgs.length > 0 && (
          <select
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            className="z-input w-auto text-sm"
          >
            <option value="">{t('dashboard.allOrgs')}</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      <SegmentedTabs
        tabs={[{ key: 'calls', label: t('dashboard.callsTab') }, { key: 'email', label: t('dashboard.emailTab') }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'calls' ? (
        <div className="space-y-5">
          {/* Hero band: primary metric (double-width) + 3 secondary */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="col-span-2">
              <HeroCard label={t('dashboard.totalCalls')} value={stats?.total_calls ?? 0} live={t('dashboard.live')} />
            </div>
            <StatCard title={t('dashboard.contacted')} value={stats?.contacted ?? 0} icon={UserGroupIcon}
              iconBg="bg-blue-500/10" iconColor="text-blue-400"
              sub={t('dashboard.contactRateSub', { rate: stats?.contact_rate ?? 0 })} />
            <StatCard title={t('dashboard.interested')} value={stats?.interested ?? 0} icon={StarIcon}
              iconBg="bg-green-500/10" iconColor="text-green-400" valueColor="text-green-400" />
            <StatCard title={t('dashboard.appointments')} value={stats?.appointments ?? 0} icon={CalendarIcon}
              iconBg="bg-blue-500/10" iconColor="text-z-blue-light" valueColor="text-z-blue-light"
              sub={t('dashboard.appointmentsSub')} />
          </div>

          {/* Secondary instrument strip */}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 mb-2">{t('dashboard.otherMetrics')}</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StripTile title={t('dashboard.notInterested')} value={stats?.not_interested ?? 0} icon={XCircleIcon} valueColor="text-red-400" />
            <StripTile title={t('dashboard.callbackPending')} value={stats?.callback_requested ?? 0} icon={ArrowPathIcon} valueColor="text-amber-400" />
            <StripTile title={t('dashboard.voicemail')} value={stats?.voicemail_count ?? 0} icon={PhoneArrowDownLeftIcon} />
            <StripTile title={t('dashboard.avgDuration')} value={fmtDur(stats?.avg_duration)} icon={ClockIcon} />
            </div>
          </div>

          {/* Minutes usage widget — only shown when limit is set */}
          {stats?.minutes_limit && (
            <div className="bg-z-card rounded-xl border border-z-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{t('dashboard.minutesUsedMonth')}</span>
                <span className={`font-mono text-xs font-bold tabular-nums ${stats.minutes_used_month >= stats.minutes_limit ? 'text-red-400' : 'text-slate-300'}`}>
                  {stats.minutes_used_month} / {stats.minutes_limit} min
                </span>
              </div>
              <div className="w-full bg-black/30 rounded-full h-[7px]">
                <div
                  className={`h-[7px] rounded-full transition-all ${stats.minutes_used_month >= stats.minutes_limit ? 'bg-red-500' : stats.minutes_used_month >= stats.minutes_limit * 0.8 ? 'bg-amber-400' : 'bg-gradient-to-r from-z-blue to-z-blue-light'}`}
                  style={{ width: `${Math.min(100, Math.round((stats.minutes_used_month / stats.minutes_limit) * 100))}%` }}
                />
              </div>
              {stats.minutes_used_month >= stats.minutes_limit && (
                <p className="text-xs text-red-400 mt-1.5">{t('dashboard.limitReached')}</p>
              )}
            </div>
          )}

          {/* Trend — gradient area chart, 3 series */}
          <Panel
            title={t('dashboard.last7Days')}
            action={
              <div className="flex flex-wrap gap-3.5 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-slate-500" />{t('dashboard.made')}</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-z-blue" />{t('dashboard.contacted2')}</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-green-500" />{t('dashboard.interested2')}</span>
              </div>
            }
          >
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={stats?.calls_per_day || []}>
                <defs>
                  <linearGradient id="gCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#64748b" stopOpacity={0.35} /><stop offset="95%" stopColor="#64748b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gContact" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563EB" stopOpacity={0.4} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gInterested" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.45} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area type="monotone" dataKey="calls" name={t('dashboard.made')} stroke="#64748b" strokeWidth={2} fill="url(#gCalls)" />
                <Area type="monotone" dataKey="contacted" name={t('dashboard.contacted2')} stroke="#2563EB" strokeWidth={2} fill="url(#gContact)" />
                <Area type="monotone" dataKey="interested" name={t('dashboard.interested2')} stroke="#10b981" strokeWidth={2} fill="url(#gInterested)" />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* Funnel + Best hour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {funnelData.some(d => d.value > 0) && (
              <Panel title={t('dashboard.funnel')}>
                <FunnelBars data={funnelData} />
              </Panel>
            )}
            {(stats?.total_calls ?? 0) >= 50 && stats?.calls_by_hour?.length > 0 && (
              <Panel
                title={t('dashboard.bestTime')}
                subtitle={bestHour ? t('dashboard.bestHourLabel', { h: bestHour.hour, hNext: bestHour.hour + 1, rate: bestHour.contact_rate }) : undefined}
              >
                <HourBars data={stats.calls_by_hour} peakHour={bestHour?.hour} />
              </Panel>
            )}
          </div>

          {/* Outcome distribution + Active campaigns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Panel title={t('dashboard.outcomeDistribution')}>
              <div className="flex items-center gap-5 flex-wrap">
                <div className="relative w-[150px] h-[150px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats?.outcome_distribution || []} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} startAngle={90} endAngle={-270} stroke="none">
                        {(stats?.outcome_distribution || []).map((d, i) => <Cell key={i} fill={OUTCOME_COLOR[d.name] || OUTCOME_FALLBACK} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [value, t(`status.${name}`, { defaultValue: name })]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="font-mono text-lg font-bold tabular-nums">{outcomeTotal}</span>
                    <span className="text-[10px] text-slate-500">{t('dashboard.callsLabel')}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 flex-1 min-w-[160px]">
                  {(stats?.outcome_distribution || []).map(d => (
                    <div key={d.name} className="flex items-center gap-2 text-xs text-slate-400">
                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: OUTCOME_COLOR[d.name] || OUTCOME_FALLBACK }} />
                      <span className="truncate">{t(`status.${d.name}`, { defaultValue: d.name })}</span>
                      <span className="font-mono tabular-nums text-slate-500 ml-auto">{outcomeTotal ? Math.round((d.value / outcomeTotal) * 100) : 0}%</span>
                    </div>
                  ))}
                  {(stats?.outcome_distribution || []).length === 0 && (
                    <span className="text-xs text-slate-600">{t('dashboard.noCampaigns')}</span>
                  )}
                </div>
              </div>
            </Panel>

            <Panel title={t('dashboard.activeCampaigns')} noPad>
              {campaigns.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-slate-500">{t('dashboard.noCampaigns')}</p>
              ) : (
                <div>
                  {campaigns.map(c => {
                    const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
                    return (
                      <div key={c.id} className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0">
                        <div className="w-[34px] h-[34px] rounded-[10px] bg-z-blue/10 text-z-blue-light flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-sm text-slate-200 truncate">{c.name}</p>
                          <StatusBadge status={c.status} pulse />
                        </div>
                        <div className="hidden sm:flex items-center gap-2 min-w-[130px]">
                          <div className="flex-1 h-1.5 rounded-full bg-black/30">
                            <div className="h-full rounded-full bg-z-blue-light" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{c.completed_prospects}/{c.total_prospects}</span>
                        </div>
                        <span className="font-mono font-bold text-green-400 text-sm tabular-nums flex-shrink-0">{c.interested}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </Panel>
          </div>

          {/* Recent interested */}
          {stats?.recent_interested?.length > 0 && (
            <Panel
              title={t('dashboard.recentInterested')}
              noPad
              action={<span className="px-2 py-0.5 bg-green-500/15 text-green-400 text-xs font-semibold rounded-full">{t('dashboard.newInterested', { count: stats.recent_interested.length })}</span>}
            >
              <div>
                {stats.recent_interested.map(r => (
                  <div key={r.call_id} className="flex items-center justify-between gap-3 px-5 py-3 border-b border-white/[0.04] last:border-0">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-slate-200 truncate">{r.prospect_name}</p>
                      <p className="text-xs text-slate-500 truncate">{r.prospect_company} · {r.campaign_name}</p>
                    </div>
                    <span className="font-mono text-xs text-slate-400 flex-shrink-0 hidden sm:inline">{r.prospect_phone}</span>
                    <span className="text-xs text-slate-500 flex-shrink-0 whitespace-nowrap">{fmtDate(r.started_at)}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </div>
      ) : (
        <EmailDashboard selectedOrg={selectedOrg} />
      )}
    </div>
  )
}
