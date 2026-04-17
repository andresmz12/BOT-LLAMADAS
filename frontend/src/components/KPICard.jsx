export default function KPICard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-z-card rounded-xl p-6 border border-z-border">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-slate-400">{title}</span>
        {Icon && (
          <div className="w-9 h-9 bg-z-blue/10 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-z-blue-light" />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-slate-100 mb-1">{value ?? '—'}</div>
      {subtitle && <div className="text-sm text-slate-500">{subtitle}</div>}
    </div>
  )
}
