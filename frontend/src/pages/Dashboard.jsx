import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { PhoneIcon, ChartBarIcon, StarIcon, CalendarIcon } from '@heroicons/react/24/outline'
import KPICard from '../components/KPICard'
import StatusBadge from '../components/StatusBadge'
import { getStats, getCampaigns } from '../api/client'

const PIE_COLORS = ['#D4AF37', '#10b981', '#3b82f6', '#ef4444', '#8b5cf6', '#f97316']

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [campaigns, setCampaigns] = useState([])

  useEffect(() => {
    getStats().then(setStats).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
  }, [])

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Llamadas" value={stats?.total_calls ?? 0} icon={PhoneIcon} />
        <KPICard title="Tasa de Respuesta" value={stats ? `${stats.answer_rate}%` : '0%'} icon={ChartBarIcon} />
        <KPICard title="Interesados" value={stats?.interested ?? 0} icon={StarIcon} />
        <KPICard title="Citas Agendadas" value={stats?.appointments ?? 0} icon={CalendarIcon} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Llamadas por Día (últimos 7 días)</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={stats?.calls_per_day || []}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="calls" fill="#D4AF37" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribución de Outcomes</h2>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={stats?.outcome_distribution || []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                {(stats?.outcome_distribution || []).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
              <Legend iconSize={10} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100">
        <div className="p-6 border-b"><h2 className="text-sm font-semibold text-gray-700">Campañas Activas</h2></div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Nombre', 'Estado', 'Progreso', 'Interesados'].map(h => (
                <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {campaigns.map(c => {
              const pct = c.total_prospects ? Math.round(c.completed_prospects / c.total_prospects * 100) : 0
              return (
                <tr key={c.id}>
                  <td className="px-6 py-4 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4"><StatusBadge status={c.status} pulse /></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-32 bg-gray-100 rounded-full h-1.5">
                        <div className="bg-gold h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs text-gray-500">{c.completed_prospects}/{c.total_prospects}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-gray-700">{c.interested}</td>
                </tr>
              )
            })}
            {campaigns.length === 0 && <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-400">No hay campañas</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
