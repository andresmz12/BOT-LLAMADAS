export default function KPICard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        {Icon && (
          <div className="w-10 h-10 bg-gold/10 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-gold" />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-gray-900 mb-1">{value ?? '—'}</div>
      {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
    </div>
  )
}
