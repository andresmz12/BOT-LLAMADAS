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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <div>
            <h2 className="text-lg font-bold text-zyra-text">{call.prospect_name || 'Prospecto'} — {call.prospect_company || ''}</h2>
            <p className="text-sm text-zyra-muted">{call.prospect_phone}</p>
          </div>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <StatusBadge status={call.outcome} />
            <span className="text-sm text-zyra-muted">{SENTIMENT_EMOJI[call.sentiment] || ''} {call.sentiment}</span>
            {call.duration_seconds && <span className="text-sm text-zyra-muted">⏱ {call.duration_seconds}s</span>}
            {call.started_at && <span className="text-sm text-zyra-muted">{new Date(call.started_at).toLocaleString()}</span>}
            {call.recording_url && (
              <a href={call.recording_url} target="_blank" rel="noreferrer"
                className="flex items-center gap-1 text-sm text-zyra-blue font-medium">
                <PlayIcon className="w-4 h-4" /> Reproducir grabación
              </a>
            )}
          </div>
          {servicesMentioned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {servicesMentioned.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-zyra-blue/20 text-blue-300 text-xs font-medium rounded-full">{s}</span>
              ))}
            </div>
          )}
          {call.appointment_scheduled && (
            <div className="bg-zyra-blue/10 border border-zyra-blue/30 rounded-xl p-4 text-blue-300">
              <p className="font-semibold">✓ Cita agendada</p>
              {call.appointment_date && <p className="text-sm mt-1">{new Date(call.appointment_date).toLocaleString()}</p>}
            </div>
          )}
          {call.notes && (
            <div className="bg-[#0F172A] rounded-xl p-4 border border-zyra-border">
              <p className="text-xs font-semibold text-zyra-muted uppercase mb-1">Nota</p>
              <p className="text-sm text-zyra-text">{call.notes}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-zyra-muted mb-3 uppercase tracking-wide">Lo que dijo el cliente</h3>
              {clientSaid.length > 0
                ? <ul className="space-y-2">{clientSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-zyra-text"><span className="text-zyra-blue mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-zyra-muted italic">Sin datos</p>}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zyra-muted mb-3 uppercase tracking-wide">Lo que hizo el agente</h3>
              {agentSaid.length > 0
                ? <ul className="space-y-2">{agentSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-zyra-text"><span className="text-zyra-blue mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-zyra-muted italic">Sin datos</p>}
            </div>
          </div>
          {call.raw_transcript && (
            <div>
              <button onClick={() => setTranscriptOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-medium text-zyra-muted hover:text-zyra-text">
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
                {transcriptOpen ? 'Ocultar' : 'Ver'} transcript completo
              </button>
              {transcriptOpen && (
                <pre className="mt-3 bg-[#0F172A] border border-zyra-border rounded-xl p-4 text-xs text-zyra-muted whitespace-pre-wrap max-h-64 overflow-y-auto">
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
