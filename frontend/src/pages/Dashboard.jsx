import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell, LabelList } from 'recharts'
import { UserGroupIcon, StarIcon, CalendarIcon, XCircleIcon, ClockIcon, PhoneArrowDownLeftIcon, ArrowPathIcon, EnvelopeIcon, CursorArrowRaysIcon, ArrowTrendingUpIcon, NoSymbolIcon } from '@heroicons/react/24/outline'
import { WaveformIcon } from '../components/Sidebar'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns, getOrganizations, getEmailStats } from '../api/client'
import { fmtDate } from '../utils/date'

const PIE_COLORS = ['#2563EB', '#10b981', '#8b5cf6', '#ef4444', '#f97316', '#3b82f6']
const FUNNEL_COLORS = ['#334155', '#2563EB', '#10b981', '#3b82f6']
const TOOLTIP_STYLE = { background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }

const TEMPLATE_LABELS = {
  interested: 'Interesado',
  callback_requested: 'Callback',
  voicemail: 'Buzón de voz',
  not_interested: 'No interesado',
  general: 'General',
}

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
  const [es, setEs] = useState(null)

  useEffect(() => {
    getEmailStats().then(setEs).catch(() => {})
  }, [selectedOrg])

  const noData = !es || es.total_sent === 0

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPI title="Enviados" value={es?.total_sent ?? 0} icon={EnvelopeIcon} iconColor="text-z-blue" />
        <KPI title="Entregados" value={es?.delivered ?? 0}
          sub={es?.delivery_rate != null ? `${es.delivery_rate}%` : undefined}
          icon={ArrowTrendingUpIcon} iconColor="text-green-400" color="text-green-400" />
        <KPI title="Abiertos" value={es?.unique_opens ?? 0}
          sub={es?.open_rate != null ? `${es.open_rate}% tasa` : undefined}
          icon={EnvelopeIcon} iconColor="text-blue-400" color="text-blue-400" />
        <KPI title="Clicks" value={es?.unique_clicks ?? 0}
          sub={es?.click_rate != null ? `${es.click_rate}% tasa` : undefined}
          icon={CursorArrowRaysIcon} iconColor="text-purple-400" color="text-purple-400" />
        <KPI title="Rebotados" value={es?.bounces ?? 0}
          sub={es?.bounce_rate != null ? `${es.bounce_rate}%` : undefined}
          icon={XCircleIcon} iconColor="text-red-400" color="text-red-400" />
        <KPI title="Desuscritos" value={es?.unsubscribes ?? 0}
          icon={NoSymbolIcon} iconColor="text-slate-500" color="text-slate-400" />
      </div>

      {noData ? (
        <div className="bg-z-card rounded-xl border border-z-border p-8 text-center space-y-3">
          <EnvelopeIcon className="w-10 h-10 text-slate-600 mx-auto" />
          <p className="text-slate-400 font-medium">No hay datos de email todavía</p>
          <p className="text-slate-600 text-sm max-w-md mx-auto">
            Cuando envíes emails desde Email Marketing, aquí verás métricas de entrega, aperturas y clicks.
          </p>
          <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg text-left max-w-md mx-auto">
            <p className="text-xs text-blue-300 font-semibold mb-1">Para activar tracking de aperturas y clicks:</p>
            <p className="text-xs text-slate-400">
              Configura el webhook de SendGrid apuntando a:
            </p>
            <code className="text-xs text-green-300 block mt-1 break-all">
              {window.location.origin}/api/settings/email/events
            </code>
            <p className="text-xs text-slate-500 mt-1">
              En SendGrid → Settings → Mail Settings → Event Webhook
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Chart — last 7 days */}
          <div className="bg-z-card rounded-xl p-5 border border-z-border">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Actividad últimos 7 días</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={es?.by_day || []} barGap={2}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="sent" name="Enviados" fill="#334155" radius={[3,3,0,0]} />
                <Bar dataKey="delivered" name="Entregados" fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="opens" name="Abiertos" fill="#10b981" radius={[3,3,0,0]} />
                <Bar dataKey="clicks" name="Clicks" fill="#8b5cf6" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* By template + recent sends */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {es?.by_template?.length > 0 && (
              <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
                <div className="p-4 border-b border-z-border">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Por plantilla</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-black/20">
                    <tr>
                      {['Plantilla', 'Enviados', 'Entregados', 'Apertura', 'Clicks'].map(h => (
                        <th key={h} className="px-4 py-2 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {es.by_template.map(t => (
                      <tr key={t.key} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 font-medium text-slate-200 capitalize">
                          {TEMPLATE_LABELS[t.key] || t.key}
                        </td>
                        <td className="px-4 py-3 text-slate-300">{t.sent}</td>
                        <td className="px-4 py-3 text-green-400">{t.delivered}</td>
                        <td className="px-4 py-3 text-blue-400">{t.open_rate}%</td>
                        <td className="px-4 py-3 text-purple-400">{t.click_rate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {es?.recent_sends?.length > 0 && (
              <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
                <div className="p-4 border-b border-z-border">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Últimos envíos</h2>
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
                        <span className="text-green-400 font-semibold">{s.total_sent} enviados</span>
                        {s.total_errors > 0 && <span className="text-red-400">{s.total_errors} errores</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function Dashboard() {
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
    { name: 'Total llamadas', value: stats.total_calls ?? 0 },
    { name: 'Contactados', value: stats.contacted ?? 0 },
    { name: 'Interesados', value: stats.interested ?? 0 },
    { name: 'Citas', value: stats.appointments ?? 0 },
  ] : []

  const bestHour = stats?.calls_by_hour?.length
    ? stats.calls_by_hour.reduce((best, h) => h.contact_rate > best.contact_rate ? h : best, stats.calls_by_hour[0])
    : null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
        {isSuperAdmin && orgs.length > 0 && (
          <select
            value={selectedOrg}
            onChange={e => setSelectedOrg(e.target.value)}
            className="z-input w-auto text-sm"
          >
            <option value="">Todas las organizaciones</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 p-1 bg-black/20 border border-z-border rounded-xl w-fit">
        <TabButton active={tab === 'calls'} onClick={() => setTab('calls')}>
          Llamadas
        </TabButton>
        <TabButton active={tab === 'email'} onClick={() => setTab('email')}>
          Email Marketing
        </TabButton>
      </div>

      {tab === 'calls' ? (
        <div className="space-y-6">
          {/* KPI Cards — 8 metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KPI title="Total llamadas" value={stats?.total_calls ?? 0} icon={WaveformIcon} iconColor="text-z-blue" />
            <KPI title="Contactados" value={stats?.contacted ?? 0} icon={UserGroupIcon} iconColor="text-blue-400"
              sub={`${stats?.contact_rate ?? 0}% tasa de contacto`} />
            <KPI title="Interesados" value={stats?.interested ?? 0} icon={StarIcon}
              color="text-green-400" iconColor="text-green-400" />
            <KPI title="No interesados" value={stats?.not_interested ?? 0} icon={XCircleIcon}
              color="text-red-400" iconColor="text-red-400" />
            <KPI title="Callback pendiente" value={stats?.callback_requested ?? 0} icon={ArrowPathIcon}
              color="text-yellow-400" iconColor="text-yellow-400" />
            <KPI title="Buzón de voz" value={stats?.voicemail_count ?? 0} icon={PhoneArrowDownLeftIcon}
              color="text-slate-400" iconColor="text-slate-500" />
            <KPI title="Citas agendadas" value={stats?.appointments ?? 0} icon={CalendarIcon}
              color="text-z-blue-light" iconColor="text-z-blue-light" />
            <KPI title="Duración promedio" value={fmtDur(stats?.avg_duration)} icon={ClockIcon}
              iconColor="text-slate-400" sub="llamadas contestadas" />
          </div>

          {/* Chart — 3 series */}
          <div className="bg-z-card rounded-xl p-5 border border-z-border">
            <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Llamadas últimos 7 días</h2>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={stats?.calls_per_day || []} barGap={2}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }} />
                <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
                <Bar dataKey="calls" name="Realizadas" fill="#334155" radius={[3,3,0,0]} />
                <Bar dataKey="contacted" name="Contactados" fill="#2563EB" radius={[3,3,0,0]} />
                <Bar dataKey="interested" name="Interesados" fill="#10b981" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Funnel + Best hour */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {funnelData.some(d => d.value > 0) && (
              <div className="bg-z-card rounded-xl p-5 border border-z-border">
                <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Embudo de conversión</h2>
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
                <h2 className="text-sm font-semibold text-slate-400 mb-1 uppercase tracking-wide">Mejor momento para llamar</h2>
                {bestHour && (
                  <p className="text-xs text-slate-500 mb-3">
                    Mejor hora: <span className="text-z-blue-light font-medium">{bestHour.hour}:00–{bestHour.hour + 1}:00</span>{' '}
                    <span className="text-green-400">({bestHour.contact_rate}% contacto)</span>
                  </p>
                )}
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={stats.calls_by_hour} barGap={1}>
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={h => `${h}h`} />
                    <YAxis hide />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v, n) => [v, n === 'calls' ? 'Llamadas' : 'Contactados']} labelFormatter={h => `${h}:00–${+h+1}:00`} />
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
              <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Distribución de outcomes</h2>
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
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Campañas activas</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[360px]">
                  <thead className="bg-black/20">
                    <tr>
                      {['Nombre', 'Estado', 'Progreso', 'Interesados'].map(h => (
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
                    {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">No hay campañas</td></tr>}
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
                  Últimos interesados <span className="ml-2 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-xs rounded-full">{stats.recent_interested.length}</span>
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead className="bg-black/20">
                    <tr>
                      {['Nombre', 'Empresa', 'Teléfono', 'Campaña', 'Fecha'].map(h => (
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
