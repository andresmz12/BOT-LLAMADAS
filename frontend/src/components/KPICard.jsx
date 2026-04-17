export default function KPICard({ title, value, subtitle, icon: Icon }) {
  return (
    <div className="bg-zyra-card rounded-xl p-6 border border-zyra-border">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium text-zyra-muted">{title}</span>
        {Icon && (
          <div className="w-10 h-10 bg-zyra-blue/10 rounded-lg flex items-center justify-center">
            <Icon className="w-5 h-5 text-zyra-blue" />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-zyra-text mb-1">{value ?? '—'}</div>
      {subtitle && <div className="text-sm text-zyra-muted">{subtitle}</div>}
    </div>
  )
}
