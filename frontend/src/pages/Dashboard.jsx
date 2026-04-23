import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { PhoneIcon, ChartBarIcon, StarIcon, CalendarIcon } from '@heroicons/react/24/outline'
import KPICard from '../components/KPICard'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns } from '../api/client'

const PIE_COLORS = ['#2563EB', '#10b981', '#8b5cf6', '#ef4444', '#f97316', '#3b82f6']

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Llamadas" value={stats?.total_calls ?? 0} icon={PhoneIcon} />
        <KPICard title="Tasa de Respuesta" value={stats ? `${stats.answer_rate}%` : '0%'} icon={ChartBarIcon} />
        <KPICard title="Interesados" value={stats?.interested ?? 0} icon={StarIcon} />
        <KPICard title="Citas Agendadas" value={stats?.appointments ?? 0} icon={CalendarIcon} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-z-card rounded-xl p-6 border border-z-border">
          <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Llamadas por Día (últimos 7 días)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.calls_per_day || []}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9' }} />
              <Bar dataKey="calls" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-z-card rounded-xl p-6 border border-z-border">
          <h2 className="text-sm font-semibold text-slate-400 mb-4 uppercase tracking-wide">Distribución de Outcomes</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={stats?.outcome_distribution || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {(stats?.outcome_distribution || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', borderRadius: 8, color: '#F1F5F9' }} />
              <Legend iconSize={10} formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="p-6 border-b border-z-border">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Campañas Activas</h2>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead className="bg-black/20">
            <tr>
              {['Nombre', 'Estado', 'Progreso', 'Interesados'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-z-border">
            {campaigns.map(c => {
              const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
              return (
                <tr key={c.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-4 font-medium text-slate-200">{c.name}</td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} pulse /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-slate-800 rounded-full h-1.5">
                        <div className="bg-z-blue h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{c.completed_prospects}/{c.total_prospects}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-300">{c.interested}</td>
                </tr>
              )
            })}
            {campaigns.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No hay campañas</td></tr>}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}
