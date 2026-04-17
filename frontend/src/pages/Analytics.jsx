import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { PhoneIcon, ChartBarIcon, StarIcon, CalendarIcon } from '@heroicons/react/24/outline'
import KPICard from '../components/KPICard'
import { getStats } from '../api/client'

const PIE_COLORS = ['#2563EB', '#10b981', '#8b5cf6', '#ef4444', '#f97316', '#06b6d4']

export default function Analytics() {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-zyra-text">Analytics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Llamadas" value={stats?.total_calls ?? 0} icon={PhoneIcon} />
        <KPICard title="Tasa de Respuesta" value={stats ? `${stats.answer_rate}%` : '0%'} icon={ChartBarIcon} />
        <KPICard title="Interesados" value={stats?.interested ?? 0} icon={StarIcon} />
        <KPICard title="Citas Agendadas" value={stats?.appointments ?? 0} icon={CalendarIcon} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-zyra-card rounded-xl p-6 border border-zyra-border">
          <h2 className="text-sm font-semibold text-zyra-muted mb-4">Llamadas por Día (últimos 7 días)</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={stats?.calls_per_day || []}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', color: '#F1F5F9' }} />
              <Bar dataKey="calls" fill="#2563EB" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-zyra-card rounded-xl p-6 border border-zyra-border">
          <h2 className="text-sm font-semibold text-zyra-muted mb-4">Distribución de Outcomes</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={stats?.outcome_distribution || []} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                {(stats?.outcome_distribution || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #1E293B', color: '#F1F5F9' }} />
              <Legend iconSize={10} wrapperStyle={{ color: '#94A3B8', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {stats?.outcome_distribution && stats.outcome_distribution.length > 0 && (
        <div className="bg-zyra-card rounded-xl border border-zyra-border">
          <div className="p-6 border-b border-zyra-border">
            <h2 className="text-sm font-semibold text-zyra-muted">Desglose por Outcome</h2>
          </div>
          <div className="p-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {stats.outcome_distribution.map((item, i) => (
              <div key={item.name} className="bg-[#0F172A] rounded-xl p-4 border border-zyra-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-xs text-zyra-muted capitalize">{item.name.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-2xl font-bold text-zyra-text">{item.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
