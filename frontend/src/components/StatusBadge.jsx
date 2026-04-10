const COLORS = {
  draft: 'bg-gray-100 text-gray-700',
  running: 'bg-green-100 text-green-700',
  paused: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
  pending: 'bg-gray-100 text-gray-600',
  calling: 'bg-blue-100 text-blue-700',
  answered: 'bg-green-100 text-green-700',
  voicemail: 'bg-purple-100 text-purple-700',
  failed: 'bg-red-100 text-red-700',
  do_not_call: 'bg-red-200 text-red-800',
  interested: 'bg-green-100 text-green-700',
  not_interested: 'bg-red-100 text-red-700',
  callback_requested: 'bg-blue-100 text-blue-700',
  appointment_scheduled: 'bg-gold/20 text-yellow-700',
  wrong_number: 'bg-orange-100 text-orange-700',
}

export default function StatusBadge({ status, pulse = false }) {
  const cls = COLORS[status] || 'bg-gray-100 text-gray-600'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {pulse && status === 'running' && (
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
      )}
      {status?.replace(/_/g, ' ')}
    </span>
  )
}
