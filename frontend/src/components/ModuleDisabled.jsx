export default function ModuleDisabled({ icon: Icon, title, hint }) {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
      <div className="p-4 rounded-full bg-slate-800 border border-z-border">
        <Icon className="w-10 h-10 text-slate-500" />
      </div>
      <h2 className="text-xl font-bold text-slate-200">{title}</h2>
      <p className="text-slate-500 max-w-sm">{hint}</p>
    </div>
  )
}
