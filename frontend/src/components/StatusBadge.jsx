const COLORS = {
  draft: 'bg-white/10 text-zyra-muted',
  running: 'bg-green-900/40 text-green-400',
  paused: 'bg-yellow-900/40 text-yellow-400',
  completed: 'bg-blue-900/40 text-blue-400',
  pending: 'bg-white/10 text-zyra-muted',
  calling: 'bg-blue-900/40 text-blue-400',
  answered: 'bg-green-900/40 text-green-400',
  voicemail: 'bg-purple-900/40 text-purple-400',
  failed: 'bg-red-900/40 text-red-400',
  do_not_call: 'bg-red-900/60 text-red-300',
  interested: 'bg-green-900/40 text-green-400',
  not_interested: 'bg-red-900/40 text-red-400',
  callback_requested: 'bg-blue-900/40 text-blue-400',
  appointment_scheduled: 'bg-zyra-blue/20 text-blue-300',
  wrong_number: 'bg-orange-900/40 text-orange-400',
}

export default function StatusBadge({ status, pulse = false }) {
  const cls = COLORS[status] || 'bg-white/10 text-zyra-muted'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {pulse && status === 'running' && (
        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
      )}
      {status?.replace(/_/g, ' ')}
    </span>
  )
}
