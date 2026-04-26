import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts'
import { UserGroupIcon, StarIcon, CalendarIcon, XCircleIcon, ClockIcon, PhoneArrowDownLeftIcon, ArrowPathIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { WaveformIcon } from '../components/Sidebar'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns, getOrganizations } from '../api/client'
import { fmtDate } from '../utils/date'

const PIE_COLORS = ['#2563EB', '#10b981', '#8b5cf6', '#ef4444', '#f97316', '#3b82f6']

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

export default function Dashboard() {
  const { t } = useTranslation()
  const isSuperAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'superadmin'

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
            <option value="">{t('dashboard.all_orgs')}</option>
            {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI title={t('dashboard.total_calls')} value={stats?.total_calls ?? 0} icon={WaveformIcon} iconColor="text-z-blue" />
        <KPI title={t('dashboard.contacted')} value={stats?.contacted ?? 0} icon={UserGroupIcon} iconColor="text-blue-400"
          sub={t('dashboard.contact_rate', { rate: stats?.contact_rate ?? 0 })} />
        <KPI title={t('dashboard.interested')} value={stats?.interested ?? 0} icon={StarIcon}
          color="text-green-400" iconColor="text-green-400" />
        <KPI title={t('dashboard.not_interested')} value={stats?.not_interested ?? 0} icon={XCircleIcon}
          color="text-red-400" iconColor="text-red-400" />
        <KPI title={t('dashboard.callback')} value={stats?.callback_requested ?? 0} icon={ArrowPathIcon}
          color="text-yellow-400" iconColor="text-yellow-400" />
        <KPI title={t('dashboard.voicemail')} value={stats?.voicemail_count ?? 0} icon={PhoneArrowDownLeftIcon}
          color="text-slate-400" iconColor="text-slate-500" />
        <KPI title={t('dashboard.appointments')} value={stats?.appointments ?? 0} icon={CalendarIcon}
          color="text-z-blue-light" iconColor="text-z-blue-light" />
        <KPI title={t('dashboard.avg_duration')} value={fmtDur(stats?.avg_duration)} icon={ClockIcon}
          iconColor="text-slate-400" sub={t('dashboard.avg_duration_sub')} />
      </div>

      {/* Chart — 3 series */}
      <div className="bg-z-card rounded-xl p-5 border border-z-border">
        <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.chart_title')}</h2>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={stats?.calls_per_day || []} barGap={2}>
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }} />
            <Legend iconSize={8} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 11 }}>{v}</span>} />
            <Bar dataKey="calls" name={t('dashboard.chart_made')} fill="#334155" radius={[3,3,0,0]} />
            <Bar dataKey="contacted" name={t('dashboard.chart_contacted')} fill="#2563EB" radius={[3,3,0,0]} />
            <Bar dataKey="interested" name={t('dashboard.chart_interested')} fill="#10b981" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Optimal call time */}
      {stats?.calls_by_hour?.some(h => h.calls > 0) && (() => {
        const hours = (stats.calls_by_hour || []).filter(h => h.hour >= 6 && h.hour <= 22 && h.calls > 0)
        const best = hours.length ? hours.reduce((a, b) => b.contact_rate > a.contact_rate ? b : a, hours[0]) : null
        return (
          <div className="bg-z-card rounded-xl p-5 border border-z-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('dashboard.best_hour_title')}</h2>
              {best && (
                <span className="px-2 py-1 bg-green-500/15 text-green-400 text-xs font-semibold rounded-full">
                  {t('dashboard.best_hour_badge', { label: best.label, rate: best.contact_rate })}
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hours} barGap={2}>
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
                <Tooltip
                  formatter={(v, _, p) => [`${v}% (${p.payload.calls})`, t('dashboard.contact_rate_label')]}
                  contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9', fontSize: 12 }}
                />
                <Bar dataKey="contact_rate" radius={[3, 3, 0, 0]}>
                  {hours.map((h, i) => (
                    <Cell key={i} fill={h.contact_rate >= 50 ? '#10b981' : h.contact_rate >= 30 ? '#2563EB' : '#334155'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )
      })()}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie chart */}
        <div className="bg-z-card rounded-xl p-5 border border-z-border">
          <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">{t('dashboard.outcomes_title')}</h2>
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
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">{t('dashboard.active_campaigns')}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[360px]">
              <thead className="bg-black/20">
                <tr>
                  {[t('dashboard.col_name'), t('dashboard.col_status'), t('dashboard.col_progress'), t('dashboard.col_interested')].map(h => (
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
                {campaigns.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500">{t('dashboard.no_campaigns')}</td></tr>}
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
              {t('dashboard.recent_interested')} <span className="ml-2 px-1.5 py-0.5 bg-green-500/15 text-green-400 text-xs rounded-full">{stats.recent_interested.length}</span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-black/20">
                <tr>
                  {[t('dashboard.col_name'), t('dashboard.col_company'), t('dashboard.col_phone'), t('dashboard.col_campaign'), t('dashboard.col_date')].map(h => (
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
  )
}
