import { useState, useEffect, useRef } from 'react'
import { RetellWebClient } from 'retell-client-js-sdk'
import { PhoneIcon, StopIcon, MicrophoneIcon } from '@heroicons/react/24/outline'
import UpgradeBanner from '../components/UpgradeBanner'
import { getDemoStatus, startDemoCall } from '../api/client'

const MAX_DEMOS = 10

export default function DemoCall() {
  const [status, setStatus] = useState(null) // { plan, demo_calls_used, limit_reached }
  const [callState, setCallState] = useState('idle') // idle | connecting | active | ended
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
        setError('Error en la llamada: ' + (e?.message || 'desconocido'))
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
      setError(err.response?.data?.detail || err.message || 'No se pudo iniciar la llamada')
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

  const used = status?.demo_calls_used ?? 0
  const limitReached = status?.limit_reached ?? false

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Llamada Demo</h1>
        <p className="text-slate-500 text-sm mt-1">Prueba tu agente desde el navegador — sin llamar a números externos</p>
      </div>

      {/* Counter */}
      <div className="bg-z-card border border-z-border rounded-xl p-4 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-1">Demos usadas</p>
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

      {limitReached ? (
        <UpgradeBanner demosUsed={used} demosTotal={MAX_DEMOS} />
      ) : (
        <div className="bg-z-card border border-z-border rounded-xl p-6 space-y-4">
          {/* Call controls */}
          <div className="flex items-center gap-4">
            {callState === 'idle' && (
              <button
                onClick={startCall}
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm transition-colors"
              >
                <PhoneIcon className="w-4 h-4" />
                Iniciar llamada demo
              </button>
            )}
            {callState === 'connecting' && (
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                Conectando...
              </div>
            )}
            {callState === 'active' && (
              <>
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                  <MicrophoneIcon className="w-4 h-4 animate-pulse" />
                  Llamada activa
                </div>
                <button
                  onClick={endCall}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  <StopIcon className="w-4 h-4" />
                  Colgar
                </button>
              </>
            )}
            {callState === 'ended' && (
              <div className="flex items-center gap-4">
                <span className="text-slate-400 text-sm">Llamada finalizada</span>
                {!limitReached && (
                  <button onClick={reset} className="px-4 py-2 z-btn-ghost text-sm">
                    Nueva llamada
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

          {/* Transcript */}
          {(transcript.length > 0 || callState === 'active') && (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium mb-2">Transcripción</p>
              <div className="bg-black/30 rounded-lg p-4 space-y-2 max-h-72 overflow-y-auto text-sm">
                {transcript.length === 0 && (
                  <p className="text-slate-600 italic text-xs">Esperando audio...</p>
                )}
                {transcript.map((t, i) => (
                  <div key={i} className={`flex gap-2 ${t.role === 'agent' ? 'flex-row' : 'flex-row-reverse'}`}>
                    <span className={`text-xs font-medium flex-shrink-0 mt-0.5 ${t.role === 'agent' ? 'text-z-blue-light' : 'text-green-400'}`}>
                      {t.role === 'agent' ? 'Agente' : 'Tú'}
                    </span>
                    <p className={`text-slate-300 leading-relaxed rounded-lg px-3 py-1 text-xs max-w-[80%] ${t.role === 'agent' ? 'bg-z-blue/10' : 'bg-white/5'}`}>
                      {t.content}
                    </p>
                  </div>
                ))}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}

          {callState === 'idle' && transcript.length === 0 && (
            <p className="text-xs text-slate-600">
              El navegador pedirá acceso al micrófono al iniciar. Asegúrate de tener un agente sincronizado en la sección Agentes.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
