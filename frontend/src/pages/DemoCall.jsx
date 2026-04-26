import { useState, useEffect, useRef } from 'react'
import { RetellWebClient } from 'retell-client-js-sdk'
import { PhoneIcon, StopIcon, MicrophoneIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import UpgradeBanner from '../components/UpgradeBanner'
import { getDemoStatus, startDemoCall } from '../api/client'

const MAX_DEMOS = 10

export default function DemoCall() {
  const { t } = useTranslation()
  const [status, setStatus] = useState(null)
  const [callState, setCallState] = useState('idle')
  const [transcript, setTranscript] = useState([])
  const [error, setError] = useState('')
  const clientRef = useRef(null)
  const transcriptEndRef = useRef(null)

  const loadStatus = () => getDemoStatus().then(setStatus).catch(() => {})

  useEffect(() => { loadStatus() }, [])
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  const startCall = async () => {
    setError('')
    setCallState('connecting')
    setTranscript([])
    try {
      const data = await startDemoCall()
      setStatus(s => ({ ...s, demo_calls_used: data.demo_calls_used, demo_calls_remaining: data.demo_calls_remaining, limit_reached: data.demo_calls_remaining <= 0 }))

      const client = new RetellWebClient()
      clientRef.current = client

      client.on('conversationStarted', () => setCallState('active'))
      client.on('conversationEnded', () => {
        setCallState('ended')
        loadStatus()
      })
      client.on('error', (e) => {
        setError(t('demo.error_start') + ': ' + (e?.message || 'unknown'))
        setCallState('idle')
      })
      client.on('update', (update) => {
        if (update?.transcript) {
          setTranscript(update.transcript.map(t => ({
            role: t.role,
            content: t.content,
          })))
        }
      })

      await client.startCall({ accessToken: data.access_token })
    } catch (err) {
      setError(err.response?.data?.detail || err.message || t('demo.error_start'))
      setCallState('idle')
    }
  }

  const endCall = () => {
    clientRef.current?.stopCall()
    setCallState('ended')
  }

  const reset = () => {
    setCallState('idle')
    setTranscript([])
    setError('')
  }

  const downloadTranscript = () => {
    const lines = transcript.map(item =>
      `[${item.role === 'agent' ? 'Agent' : 'You'}]: ${item.content}`
    )
    const text = lines.join('\n\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-demo-${new Date().toISOString().slice(0, 10)}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const used = status?.demo_calls_used ?? 0
  const limitReached = status?.limit_reached ?? false
  const isFree = status?.plan === 'free'

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">{t('demo.title')}</h1>
        <p className="text-slate-500 text-sm mt-1">{t('demo.subtitle')}</p>
      </div>

      {isFree && (
        <div className="bg-z-card border border-z-border rounded-xl p-4 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">{t('demo.counter', { used, total: MAX_DEMOS })}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 bg-slate-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${used >= MAX_DEMOS ? 'bg-red-500' : 'bg-z-blue'}`}
                  style={{ width: `${Math.min(100, (used / MAX_DEMOS) * 100)}%` }}
                />
              </div>
              <span className={`text-sm font-bold tabular-nums ${used >= MAX_DEMOS ? 'text-red-400' : 'text-slate-200'}`}>
                {used}/{MAX_DEMOS}
              </span>
            </div>
          </div>
        </div>
      )}

      {limitReached ? (
        <UpgradeBanner demosUsed={used} demosTotal={MAX_DEMOS} />
      ) : (
        <div className="bg-z-card border border-z-border rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            {callState === 'idle' && (
              <button
                onClick={startCall}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
                {t('demo.start_btn')}
              </button>
            )}
            {callState === 'connecting' && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                {t('demo.connecting')}
              </div>
            )}
            {callState === 'active' && (
              <>
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <MicrophoneIcon className="w-4 h-4 animate-pulse" />
                  {t('demo.active')}
                </div>
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  <StopIcon className="w-4 h-4" />
                  {t('demo.end_btn')}
                </button>
              </>
            )}
            {callState === 'ended' && (
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-slate-400 text-sm">{t('demo.ended_title')}</span>
                {!isFree && transcript.length > 0 && (
                  <button
                    onClick={downloadTranscript}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-z-blue/15 hover:bg-z-blue/25 text-z-blue-light text-sm font-medium rounded-lg transition-colors"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                    {t('demo.download_btn')}
                  </button>
                )}
                {!limitReached && (
                  <button onClick={reset} className="px-4 py-2 z-btn-ghost text-sm">
                    {t('demo.new_call_btn')}
                  </button>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {(transcript.length > 0 || callState === 'active') && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">{t('demo.transcript_title')}</p>
              <div className="bg-black/30 rounded-lg p-4 space-y-2 max-h-72 overflow-y-auto text-sm">
                {transcript.length === 0 && (
                  <p className="text-slate-600 italic text-xs">{t('demo.no_transcript')}</p>
                )}
                {transcript.map((item, i) => (
                  <div key={i} className={`flex gap-2 ${item.role === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <span className={`text-xs font-medium flex-shrink-0 mt-0.5 ${item.role === 'agent' ? 'text-z-blue-light' : 'text-green-400'}`}>
                      {item.role === 'agent' ? 'Agent' : 'You'}
                    </span>
                    <p className={`text-slate-300 leading-relaxed rounded-lg px-3 py-1 text-xs max-w-[80%] ${item.role === 'agent' ? 'bg-z-blue/10' : 'bg-white/5'}`}>
                      {item.content}
                    </p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}

          {callState === 'idle' && transcript.length === 0 && (
            <p className="text-xs text-slate-600">{t('demo.mic_required')}</p>
          )}
        </div>
      )}
    </div>
  )
}
