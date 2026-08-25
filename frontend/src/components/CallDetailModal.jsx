import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline'
import StatusBadge from './StatusBadge'
import { fmtDate } from '../utils/date'

const SENTIMENT_EMOJI = { positive: '😊', neutral: '😐', negative: '😞' }

export default function CallDetailModal({ call, onClose }) {
  const { t } = useTranslation()
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const [costOpen, setCostOpen] = useState(false)
  if (!call) return null

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isSuperadmin = user.role === 'superadmin'

  let clientSaid = [], agentSaid = [], servicesMentioned = [], costBreakdown = []
  try { clientSaid = JSON.parse(call.client_said || '[]') } catch {}
  try { agentSaid = JSON.parse(call.agent_said || '[]') } catch {}
  try { servicesMentioned = JSON.parse(call.services_mentioned || '[]') } catch {}
  try { costBreakdown = JSON.parse(call.retell_cost_breakdown || '[]') } catch {}

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <div>
            <h2 className="text-lg font-bold text-slate-100">{call.prospect_name || t('callDetail.prospect')} — {call.prospect_company || ''}</h2>
            <p className="text-sm text-slate-500">{call.prospect_phone}</p>
          </div>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500 hover:text-slate-300" /></button>
        </div>
        <div className="p-6 space-y-6">
          <div className="flex flex-wrap gap-3 items-center">
            <StatusBadge status={call.outcome} />
            <span className="text-sm text-slate-400">{SENTIMENT_EMOJI[call.sentiment] || ''} {call.sentiment}</span>
            {call.duration_seconds && <span className="text-sm text-slate-400">⏱ {call.duration_seconds}s</span>}
            {call.started_at && <span className="text-sm text-slate-500">{fmtDate(call.started_at)}</span>}
          </div>
          {call.recording_url && (
            <audio controls preload="none" src={call.recording_url} className="w-full h-10 rounded-lg">
              <a href={call.recording_url} target="_blank" rel="noreferrer" className="text-z-blue-light">
                {t('callDetail.playRecording')}
              </a>
            </audio>
          )}
          {servicesMentioned.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {servicesMentioned.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-z-blue/15 text-z-blue-light text-xs font-medium rounded-full">{s}</span>
              ))}
            </div>
          )}
          {call.appointment_scheduled && (
            <div className="bg-z-blue/10 border border-z-blue/30 rounded-xl p-4 text-blue-300">
              <p className="font-semibold">{t('callDetail.appointmentScheduled')}</p>
              {call.appointment_date && <p className="text-sm mt-1">{fmtDate(call.appointment_date)}</p>}
            </div>
          )}
          {call.notes && (
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">{t('callDetail.note')}</p>
              <p className="text-sm text-slate-300">{call.notes}</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">{t('callDetail.clientSaid')}</h3>
              {clientSaid.length > 0
                ? <ul className="space-y-2">{clientSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-300"><span className="text-z-blue-light mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-slate-500 italic">{t('callDetail.noData')}</p>}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3 uppercase tracking-wide">{t('callDetail.agentDid')}</h3>
              {agentSaid.length > 0
                ? <ul className="space-y-2">{agentSaid.map((p, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-300"><span className="text-z-blue-light mt-0.5">•</span>{p}</li>)}</ul>
                : <p className="text-sm text-slate-500 italic">{t('callDetail.noData')}</p>}
            </div>
          </div>
          {isSuperadmin && call.retell_cost_cents != null && (
            <div>
              <button onClick={() => setCostOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300">
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${costOpen ? 'rotate-180' : ''}`} />
                {t('callDetail.retellCost', { amount: (call.retell_cost_cents / 100).toFixed(4) })}
              </button>
              {costOpen && costBreakdown.length > 0 && (
                <table className="mt-3 w-full text-xs bg-slate-800 rounded-xl overflow-hidden">
                  <thead className="bg-black/20">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-slate-500">{t('callDetail.costProduct')}</th>
                      <th className="px-3 py-2 text-right font-medium text-slate-500">{t('callDetail.costAmount')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {costBreakdown.map((p, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-slate-300">{p.product}</td>
                        <td className="px-3 py-2 text-right text-slate-300 font-mono">${(p.cost / 100).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
          {call.raw_transcript && (
            <div>
              <button onClick={() => setTranscriptOpen(o => !o)}
                className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-300">
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${transcriptOpen ? 'rotate-180' : ''}`} />
                {transcriptOpen ? t('callDetail.hideTranscript') : t('callDetail.viewTranscript')} {t('callDetail.transcriptFull')}
              </button>
              {transcriptOpen && (
                <pre className="mt-3 bg-slate-800 rounded-xl p-4 text-xs text-slate-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
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
