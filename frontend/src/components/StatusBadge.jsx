const CONFIG = {
  draft:                { cls: 'bg-slate-700 text-slate-300',         label: 'Borrador' },
  running:              { cls: 'bg-green-500/20 text-green-400',       label: 'Corriendo' },
  paused:               { cls: 'bg-yellow-500/20 text-yellow-400',     label: 'Pausada' },
  completed:            { cls: 'bg-blue-500/20 text-blue-400',         label: 'Completada' },
  pending:              { cls: 'bg-slate-700 text-slate-400',           label: 'Pendiente' },
  calling:              { cls: 'bg-blue-500/20 text-blue-400',         label: 'Llamando' },
  answered:             { cls: 'bg-green-500/20 text-green-400',       label: 'Contestó' },
  voicemail:            { cls: 'bg-purple-500/20 text-purple-400',     label: 'Buzón' },
  no_answer:            { cls: 'bg-slate-600/40 text-slate-400',       label: 'Finalizada' },
  failed:               { cls: 'bg-slate-600/40 text-slate-400',       label: 'Finalizada' },
  do_not_call:          { cls: 'bg-red-600/30 text-red-300',           label: 'No llamar' },
  interested:           { cls: 'bg-green-500/20 text-green-400',       label: 'Interesado' },
  not_interested:       { cls: 'bg-red-500/20 text-red-400',           label: 'No interesado' },
  callback_requested:   { cls: 'bg-blue-500/20 text-blue-400',         label: 'Devolución' },
  appointment_scheduled:{ cls: 'bg-z-blue/20 text-z-blue-light',       label: 'Cita agendada' },
  wrong_number:         { cls: 'bg-orange-500/20 text-orange-400',     label: 'Número incorrecto' },
}

export default function StatusBadge({ status, pulse = false }) {
  const { cls, label } = CONFIG[status] || { cls: 'bg-slate-700 text-slate-400', label: status?.replace(/_/g, ' ') || '—' }
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {pulse && status === 'running' && (
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
      )}
      {label}
    </span>
  )
}
