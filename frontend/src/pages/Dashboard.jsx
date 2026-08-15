import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, LabelList } from 'recharts'
import { UserGroupIcon, StarIcon, CalendarIcon, XCircleIcon, ClockIcon, PhoneArrowDownLeftIcon, ArrowPathIcon, EnvelopeIcon, CursorArrowRaysIcon, ArrowTrendingUpIcon, NoSymbolIcon } from '@heroicons/react/24/outline'
import { WaveformIcon } from '../components/Sidebar'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns, getOrganizations, getEmailStats, getEmailEvents, downloadEmailStatsPdf } from '../api/client'
import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { fmtDate } from '../utils/date'

const PIE_COLORS = ['#2563EB', '#10b981', '#8b5cf6', '#ef4444', '#f97316', '#3b82f6']
const FUNNEL_COLORS = ['#334155', '#2563EB', '#10b981', '#3b82f6']
const TOOLTIP_STYLE = { background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }

function KPI({ title, value, sub, color = 'text-slate-100', icon: Icon, iconColor = 'text-slate-500' }) {
  return (
    <div className="bg-z-card rounded-xl p-4 border border-z-border flex items-start gap-3">
      {Icon && (
        <div className={`p-2 rounded-lg bg-white/5 flex-shrink-0 ${iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div className="min-w-0">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide truncate">{title}</p>
        <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors ${
        active
          ? 'bg-z-blue text-white'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300">{t('dashboard.email.metricsTitle')}</h2>
        <button
          onClick={handleDownloadPdf}
          disabled={pdfLoading || noData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-z-border rounded-lg transition-colors disabled:opacity-40"
        >
          <ArrowDownTrayIcon className="w-3.5 h-3.5" />
          {pdfLoading ? t('dashboard.email.generatingPdf') : t('dashboard.email.downloadPdf')}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI title={t('dashboard.email.kpiSent')} value={es?.total_sent ?? 0} icon={EnvelopeIcon} iconColor="text-z-blue" />
        <KPI title={t('dashboard.email.kpiDelivered')} value={es?.delivered ?? 0}
          sub={es?.delivery_rate != null ? `${es.delivery_rate}%` : undefined}
          icon={ArrowTrendingUpIcon} iconColor="text-green-400" color="text-green-400" />
        <KPI title={t('dashboard.email.kpiOpened')} value={es?.unique_opens ?? 0}
          sub={es?.open_rate != null ? t('dashboard.email.kpiOpenRate', { rate: es.open_rate }) : undefined}
          icon={EnvelopeIcon} iconColor="text-blue-400" color="text-blue-400" />
        <KPI title={t('dashboard.email.kpiClicks')} value={es?.unique_clicks ?? 0}
          sub={es?.click_rate != null ? t('dashboard.email.kpiClickRate', { rate: es.click_rate }) : undefined}
          icon={CursorArrowRaysIcon} iconColor="text-purple-400" color="text-purple-400" />
        <KPI title={t('dashboard.email.kpiBounced')} value={es?.bounces ?? 0}
          sub={es?.bounce_rate != null ? `${es.bounce_rate}%` : undefined}
          icon={XCircleIcon} iconColor="text-red-400" color="text-red-400" />
        <KPI title={t('dashboard.email.kpiUnsubscribed')} value={es?.unsubscribes ?? 0}
          icon={NoSymbolIcon} iconColor="text-slate-500" color="text-slate-400" />
      </div>

      {noData ? (
        <div className="bg-z-card rounded-xl border border-z-border p-8 text-center">
          <EnvelopeIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-400 font-medium">{t('dashboard.email.noDataTitle')}</p>
          <p className="text-slate-600 text-sm mt-1">{t('dashboard.email.noDataHint')}</p>
        </div>
      ) : (
        <>
          {/* Chart — last 7 days */}
          <div className="bg-z-card rounded-xl p-5 border border-z-border">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.email.activityLast7Days')}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={es?.by_day || []} barGap={2}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="sent" name={t('dashboard.email.chartSent')} fill="#334155" radius={[3,3,0,0]} />
                <Bar dataKey="delivered" name={t('dashboard.email.chartDelivered')} fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="opens" name={t('dashboard.email.chartOpens')} fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="clicks" name={t('dashboard.email.chartClicks')} fill="#8b5cf6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By template + recent sends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {es?.by_template?.length > 0 && (
              <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
                <div className="p-4 border-b border-z-border">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('dashboard.email.byTemplate')}</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-black/20">
                    <tr>
                      {[t('dashboard.email.templateHeaders.template'), t('dashboard.email.templateHeaders.sent'), t('dashboard.email.templateHeaders.delivered'), t('dashboard.email.templateHeaders.openRate'), t('dashboard.email.templateHeaders.clickRate')].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {es.by_template.map(tpl => (
                      <tr key={tpl.key} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-slate-200 capitalize">
                          {TEMPLATE_LABELS[tpl.key] || tpl.key}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{tpl.sent}</td>
                        <td className="px-4 py-3 text-green-400">{tpl.delivered}</td>
                        <td className="px-4 py-3 text-blue-400">{tpl.open_rate}%</td>
                        <td className="px-4 py-3 text-purple-400">{tpl.click_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {es?.recent_sends?.length > 0 && (
              <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
                <div className="p-4 border-b border-z-border">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('dashboard.email.recentSends')}</h2>
                </div>
                <div className="divide-y divide-z-border">
                  {es.recent_sends.map((s, i) => (
                    <div key={i} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-200 font-medium truncate">
                          {TEMPLATE_LABELS[s.template_key] || s.template_key}
                          {s.campaign_name && <span className="text-slate-500 font-normal"> · {s.campaign_name}</span>}
                        </p>
                        <p className="text-xs text-slate-500">{fmtDate(s.sent_at)}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 text-xs">
                        <span className="text-green-400 font-semibold">{t('dashboard.email.sentCount', { count: s.total_sent })}</span>
                        {s.total_errors > 0 && <span className="text-red-400">{t('dashboard.email.errorsCount', { count: s.total_errors })}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Seguimiento individual de emails ── */}
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="px-5 py-4 border-b border-z-border flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{t('dashboard.email.trackingTitle')}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{t('dashboard.email.trackingSubtitle')}</p>
          </div>
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
        </div>

        {trackingEvents !== null && (
          <>
            {/* Tabs */}
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
                          {count > 0 && <span className={`ml-1.5 font-bold ${trackingTab === tab.key ? 'text-slate-300' : (tab.color || 'text-slate-400')}`}>{count}</span>}
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
                              <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
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
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { t } = useTranslation()
  const isSuperAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin'

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

  const funnelData = stats ? [
    { name: t('dashboard.totalCalls'), value: stats.total_calls ?? 0 },
    { name: t('dashboard.contacted'), value: stats.contacted ?? 0 },
    { name: t('dashboard.interested'), value: stats.interested ?? 0 },
    { name: t('dashboard.appointments'), value: stats.appointments ?? 0 },
  ] : []

  const bestHour = stats?.calls_by_hour?.length
    ? stats.calls_by_hour.reduce((best, h) => h.contact_rate > best.contact_rate ? h : best, stats.calls_by_hour[0])
    : null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-100">{t('dashboard.title')}</h1>
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

      {/* Tab switcher */}
      <div className="flex gap-2 p-1 bg-black/20 border border-z-border rounded-xl w-fit">
        <TabButton active={tab === 'calls'} onClick={() => setTab('calls')}>
          {t('dashboard.callsTab')}
        </TabButton>
        <TabButton active={tab === 'email'} onClick={() => setTab('email')}>
          {t('dashboard.emailTab')}
        </TabButton>
      </div>

      {tab === 'calls' ? (
        <div className="space-y-6">
          {/* KPI Cards — 8 metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI title={t('dashboard.totalCalls')} value={stats?.total_calls ?? 0} icon={WaveformIcon} iconColor="text-z-blue" />
            <KPI title={t('dashboard.contacted')} value={stats?.contacted ?? 0} icon={UserGroupIcon} iconColor="text-blue-400"
              sub={t('dashboard.contactRateSub', { rate: stats?.contact_rate ?? 0 })} />
            <KPI title={t('dashboard.interested')} value={stats?.interested ?? 0} icon={StarIcon}
              color="text-green-400" iconColor="text-green-400" />
            <KPI title={t('dashboard.notInterested')} value={stats?.not_interested ?? 0} icon={XCircleIcon}
              color="text-red-400" iconColor="text-red-400" />
            <KPI title={t('dashboard.callbackPending')} value={stats?.callback_requested ?? 0} icon={ArrowPathIcon}
              color="text-yellow-400" iconColor="text-yellow-400" />
            <KPI title={t('dashboard.voicemail')} value={stats?.voicemail_count ?? 0} icon={PhoneArrowDownLeftIcon}
              color="text-slate-400" iconColor="text-slate-500" />
            <KPI title={t('dashboard.appointments')} value={stats?.appointments ?? 0} icon={CalendarIcon}
              color="text-z-blue-light" iconColor="text-z-blue-light" />
            <KPI title={t('dashboard.avgDuration')} value={fmtDur(stats?.avg_duration)} icon={ClockIcon}
              iconColor="text-slate-400" sub={t('dashboard.answeredCalls')} />
          </div>

          {/* Minutes usage widget — only shown when limit is set */}
          {stats?.minutes_limit && (
            <div className="bg-z-card rounded-xl border border-z-border p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">{t('dashboard.minutesUsedMonth')}</span>
                <span className={`text-xs font-bold ${stats.minutes_used_month >= stats.minutes_limit ? 'text-red-400' : 'text-slate-300'}`}>
                  {stats.minutes_used_month} / {stats.minutes_limit} min
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${stats.minutes_used_month >= stats.minutes_limit ? 'bg-red-500' : stats.minutes_used_month >= stats.minutes_limit * 0.8 ? 'bg-amber-400' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, Math.round((stats.minutes_used_month / stats.minutes_limit) * 100))}%` }}
                />
              </div>
              {stats.minutes_used_month >= stats.minutes_limit && (
                <p className="text-xs text-red-400 mt-1.5">{t('dashboard.limitReached')}</p>
              )}
            </div>
          )}

          {/* Chart — 3 series */}
          <div className="bg-z-card rounded-xl p-5 border border-z-border">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.last7Days')}</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats?.calls_per_day || []} barGap={2}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }} />
                <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="calls" name={t('dashboard.made')} fill="#334155" radius={[3,3,0,0]} />
                <Bar dataKey="contacted" name={t('dashboard.contacted2')} fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="interested" name={t('dashboard.interested2')} fill="#10b981" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel + Best hour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {funnelData.some(d => d.value > 0) && (
              <div className="bg-z-card rounded-xl p-5 border border-z-border">
                <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.funnel')}</h2>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={funnelData} layout="vertical">
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {funnelData.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i]} />)}
                      <LabelList dataKey="value" position="right" style={{ fill: '#94a3b8', fontSize: 12 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {(stats?.total_calls ?? 0) >= 50 && stats?.calls_by_hour?.length > 0 && (
              <div className="bg-z-card rounded-xl p-5 border border-z-border">
                <h2 className="text-sm font-semibold text-slate-400 mb-1 uppercase tracking-wide">{t('dashboard.bestTime')}</h2>
                {bestHour && (
                  <p className="text-xs text-slate-500 mb-3">
                    {t('dashboard.bestHourLabel', { h: bestHour.hour, hNext: bestHour.hour + 1, rate: bestHour.contact_rate })}
                  </p>
                )}
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={stats.calls_by_hour} barGap={1}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={h => `${h}h`} />
                    <YAxis hide />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v, n === 'calls' ? t('dashboard.callsLabel') : t('dashboard.contacted')]} labelFormatter={h => `${h}:00–${+h+1}:00`} />
                    <Bar dataKey="calls" radius={[2, 2, 0, 0]}>
                      {stats.calls_by_hour.map((h, i) => (
                        <Cell key={i} fill={`rgba(37,99,235,${0.2 + (h.contact_rate / 100) * 0.8})`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie chart */}
            <div className="bg-z-card rounded-xl p-5 border border-z-border">
              <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.outcomeDistribution')}</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={stats?.outcome_distribution || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {(stats?.outcome_distribution || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }} />
                  <Legend iconSize={10} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Active campaigns */}
            <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
              <div className="p-4 border-b border-z-border">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('dashboard.activeCampaigns')}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="bg-black/20">
                    <tr>
                      {[t('dashboard.headers.name'), t('dashboard.headers.status'), t('dashboard.headers.progress'), t('dashboard.headers.interested')].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {campaigns.map(c => {
                      const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
                      return (
                        <tr key={c.id} className="hover:bg-white/[0.02]">
                          <td className="px-4 py-3 font-medium text-slate-200 truncate max-w-[140px]">{c.name}</td>
                          <td className="px-4 py-3"><StatusBadge status={c.status} pulse /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-slate-800 rounded-full h-1.5">
                                <div className="bg-z-blue h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-slate-500">{c.completed_prospects}/{c.total_prospects}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-green-400 font-semibold">{c.interested}</td>
                        </tr>
                      )
                    })}
                    {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t('dashboard.noCampaigns')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Recent interested */}
          {stats?.recent_interested?.length > 0 && (
            <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
              <div className="p-4 border-b border-z-border">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">
                  {t('dashboard.recentInterested')} <span className="ml-2 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-xs rounded-full">{stats.recent_interested.length}</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-black/20">
                    <tr>
                      {[t('dashboard.headers.name2'), t('dashboard.headers.company'), t('dashboard.headers.phone'), t('dashboard.headers.campaign'), t('dashboard.headers.date')].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {stats.recent_interested.map(r => (
                      <tr key={r.call_id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-slate-200">{r.prospect_name}</td>
                        <td className="px-4 py-3 text-slate-400">{r.prospect_company}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-300">{r.prospect_phone}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{r.campaign_name}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(r.started_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : (
        <EmailDashboard selectedOrg={selectedOrg} />
      )}
    </div>
  )
}
