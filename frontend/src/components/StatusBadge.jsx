const COLORS = {
  draft:                'bg-slate-700 text-slate-300',
  running:              'bg-green-500/20 text-green-400',
  paused:               'bg-yellow-500/20 text-yellow-400',
  completed:            'bg-blue-500/20 text-blue-400',
  pending:              'bg-slate-700 text-slate-400',
  calling:              'bg-blue-500/20 text-blue-400',
  answered:             'bg-green-500/20 text-green-400',
  voicemail:            'bg-purple-500/20 text-purple-400',
  failed:               'bg-red-500/20 text-red-400',
  do_not_call:          'bg-red-600/30 text-red-300',
  interested:           'bg-green-500/20 text-green-400',
  not_interested:       'bg-red-500/20 text-red-400',
  callback_requested:   'bg-blue-500/20 text-blue-400',
  appointment_scheduled:'bg-z-blue/20 text-z-blue-light',
  wrong_number:         'bg-orange-500/20 text-orange-400',
}

export default function StatusBadge({ status, pulse = false }) {
  const cls = COLORS[status] || 'bg-slate-700 text-slate-400'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {pulse && status === 'running' && (
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
      )}
      {status?.replace(/_/g, ' ')}
    </span>
  )
}
