import { useState } from 'react'
import { XMarkIcon, ChevronDownIcon, PlayIcon } from '@heroicons/react/24/outline'
import StatusBadge from './StatusBadge'

const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞' }

export default function CallDetailModal({ call, onClose }) {
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  if (!call) return null

  let clientSaid = [], agentSaid = [], servicesMentioned = []
  try { clientSaid = JSON.parse(call.client_said || '[]') } catch {}
  try { agentSaid = JSON.parse(call.agent_said || '[]') } catch {}
  try { servicesMentioned = JSON.parse(call.services_mentioned || '[]') } catch {}

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold">{call.prospect_name || 'Prospecto'} — {call.prospect_company || ''}</h2>
            <p className="text-sm text-gray-500">{call.prospect_phone}</p>
          </div>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <StatusBadge status={call.outcome} />
            <span className="text-sm text-gray-600">{SENTIMENT_EMOJI[call.sentiment] || ''} {call.sentiment}</span>
            {call.duration_seconds && <span className="text-sm text-gray-600">⏱ {call.duration_seconds}s</span>}
            {call.started_at && <span className="text-sm text-gray-500">{new Date(call.started_at).toLocaleString()}</span>}
            {call.recording_url && (
              <a href={call.recording_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-sm text-gold font-medium">
                <PlayIcon className="w-4 h-4" /> Reproducir grabación
              </a>
            )}
          </div>
          {servicesMentioned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {servicesMentioned.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-gold/15 text-yellow-800 text-xs font-medium rounded-full">{s}</span>
              ))}
            </div>
          )}
          {call.appointment_scheduled && (
            <div className="bg-gold/10 border border-gold/40 rounded-xl p-4 text-yellow-800">
              <p className="font-semibold">✓ Cita agendada</p>
              {call.appointment_date && <p className="text-sm mt-1">{new Date(call.appointment_date).toLocaleString()}</p>}
            </div>
          )}
          {call.notes && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Nota</p>
              <p className="text-sm text-gray-700">{call.notes}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Lo que dijo el cliente</h3>
              {clientSaid.length > 0
                ? <ul className="space-y-2">{clientSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-600"><span className="text-gold mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-gray-400 italic">Sin datos</p>}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">Lo que hizo el agente</h3>
              {agentSaid.length > 0
                ? <ul className="space-y-2">{agentSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-gray-600"><span className="text-gold mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-gray-400 italic">Sin datos</p>}
            </div>
          </div>
          {call.raw_transcript && (
            <div>
              <button onClick={() => setTranscriptOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700">
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
                {transcriptOpen ? 'Ocultar' : 'Ver'} transcript completo
              </button>
              {transcriptOpen && (
                <pre className="mt-3 bg-gray-50 rounded-xl p-4 text-xs text-gray-600 whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {call.raw_transcript}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
