import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, DocumentArrowUpIcon, ExclamationTriangleIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon, SparklesIcon, PhoneIcon } from '@heroicons/react/24/outline'
import { createAgent, updateAgent, syncAgent, uploadKnowledgeBase, getAgentPromptPreview, listVoices, generateAgentFromDescription } from '../api/client'
import { errText } from '../utils/errText'

const VOICES = [
  { value: 'retell-Andrea',    label: 'Andrea (Mexicana · Adulta)' },
  { value: 'retell-Claudia',   label: 'Claudia (Mexicana · Adulta)' },
  { value: 'retell-Gaby',      label: 'Gaby (Mexicana · Joven)' },
  { value: 'retell-Alejandro', label: 'Alejandro (Mexicano · Joven · Masculino)' },
  { value: 'retell-Brynne',    label: 'Brynne (Americana · Adulta)' },
  { value: 'retell-Chloe',     label: 'Chloe (Americana · Joven)' },
  { value: 'retell-Grace',     label: 'Grace (Americana · Adulta)' },
  { value: 'retell-Rita',      label: 'Rita (Americana · Joven)' },
  { value: 'custom_voice_a34b86b65a31f267214f0c19d6', label: '🎙 Andrés M (Voz personalizada)' },
]

const TEMPERATURES = [
  { value: 0.7, label: 'Creativo (0.7)' },
  { value: 0.4, label: 'Balanceado (0.4)' },
  { value: 0.2, label: 'Preciso (0.2)' },
]

const ALLOWED_EXTS = ['.pdf', '.txt', '.docx', '.doc', '.md', '.csv']
const MAX_MB = 10

const EMPTY = {
  name: '', agent_name: '', company_name: '', company_info: '',
  services: '', instructions: '', language: 'español',
  max_call_duration: 180, is_default: false,
  voice_id: 'retell-Andrea',
  outbound_system_prompt: '',
  outbound_first_message: '',
  voicemail_message: '',
  temperature: 0.4,
  inbound_enabled: false,
  inbound_system_prompt: '',
  inbound_first_message: '',
  call_objective: '',
  target_audience: '',
  custom_objections: '',
}

function computeScore(form, t) {
  let score = 15 // required fields always filled
  const warnings = []
  const infoLen = (form.company_info || '').length
  if (infoLen > 100) score += 15
  else if (infoLen > 20) { score += 7; warnings.push(t('agentForm.warnCompanyInfoShort')) }
  else warnings.push(t('agentForm.warnCompanyInfoMissing'))

  const svcLen = (form.services || '').length
  if (svcLen > 100) score += 15
  else if (svcLen > 20) { score += 7; warnings.push(t('agentForm.warnServicesShort')) }
  else warnings.push(t('agentForm.warnServicesMissing'))

  if (form.target_audience) score += 15
  else warnings.push(t('agentForm.warnNoAudience'))

  if (form.call_objective) score += 15
  else warnings.push(t('agentForm.warnNoObjective'))

  if (form.custom_objections) score += 10
  else warnings.push(t('agentForm.warnNoObjections'))

  if (form.voicemail_message) score += 5
  else warnings.push(t('agentForm.warnNoVoicemail'))

  if (form.outbound_first_message) score += 5

  return { score: Math.min(score, 100), warnings }
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreLabel(score, t) {
  if (score >= 80) return t('agentForm.scoreWell')
  if (score >= 50) return t('agentForm.scoreBasic')
  return t('agentForm.scoreIncomplete')
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AgentFormModal({ agent, onClose, onSaved }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [form, setForm] = useState(agent ? { ...EMPTY, ...agent } : { ...EMPTY })
  const [syncOnSave, setSyncOnSave] = useState(true)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [callTab, setCallTab] = useState('outbound')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const CALL_OBJECTIVES = [
    { value: '', label: t('agentForm.objectiveNone') },
    { value: 'agendar_cita', label: t('agentForm.objectiveSchedule') },
    { value: 'calificar_interes', label: t('agentForm.objectiveQualify') },
    { value: 'cerrar_venta', label: t('agentForm.objectiveClose') },
    { value: 'informar_promocion', label: t('agentForm.objectivePromo') },
  ]

  // "Describe your business, we fill the form" — quick-start for new agents.
  const [description, setDescription] = useState('')
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [savedAgentId, setSavedAgentId] = useState(agent?.id || null)

  const runGenerate = async () => {
    if (!description.trim()) return
    setGenerating(true)
    setGenerateError('')
    try {
      const data = await generateAgentFromDescription(description.trim())
      setForm(f => ({ ...f, ...data }))
    } catch (err) {
      setGenerateError(errText(err.response?.data?.detail, err.message || t('agentForm.generateError')))
    } finally {
      setGenerating(false)
    }
  }

  // Voice catalog — pulled live from Retell so new voices show up on their own.
  const [voices, setVoices] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(true)
  const [voicesError, setVoicesError] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    listVoices()
      .then(data => {
        if (cancelled) return
        setVoices(Array.isArray(data) ? data : [])
        setVoicesError(false)
      })
      .catch(() => { if (!cancelled) setVoicesError(true) })
      .finally(() => { if (!cancelled) setVoicesLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Fall back to the built-in list if the catalog can't be reached, so the form
  // still works when Retell is down or the key is missing.
  const voiceOptions = voices.length
    ? voices.map(v => ({
        value: v.voice_id,
        label: [
          v.voice_name || v.voice_id,
          [v.accent, v.gender, v.age].filter(Boolean).join(' · '),
          v.provider,
        ].filter(Boolean).join(' — '),
      }))
    : VOICES

  const previewUrl = voices.find(v => v.voice_id === (form.voice_id || 'retell-Andrea'))?.preview_audio_url || ''

  const playPreview = () => {
    if (!previewUrl) return
    if (audioRef.current) audioRef.current.pause()
    audioRef.current = new Audio(previewUrl)
    audioRef.current.play().catch(() => {})
  }

  // KB state
  const [kbFile, setKbFile] = useState(null)
  const [kbFileError, setKbFileError] = useState('')
  const [kbStatus, setKbStatus] = useState(null) // null | 'uploading' | 'ok' | 'warning'
  const [kbWarning, setKbWarning] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const loadPreview = async () => {
    if (!agent?.id) return
    setPreviewLoading(true)
    try {
      const data = await getAgentPromptPreview(agent.id)
      setPreviewData(data)
      setPreviewOpen(true)
    } catch (e) {
      alert(t('agentForm.previewLoadError', { detail: e.response?.data?.detail || e.message }))
    } finally {
      setPreviewLoading(false)
    }
  }

  const validateAndSetFile = (file) => {
    setKbFileError('')
    if (!file) return
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      setKbFileError(t('agentForm.invalidFormat', { exts: ALLOWED_EXTS.join(', ') }))
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setKbFileError(t('agentForm.fileTooLarge', { max: MAX_MB }))
      return
    }
    setKbFile(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndSetFile(file)
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSyncStatus(null)
    setKbStatus(null)
    setKbWarning('')

    try {
      // Step 1: Save agent
      let saved
      if (agent?.id) {
        saved = await updateAgent(agent.id, form)
      } else {
        saved = await createAgent(form)
      }
      setSavedAgentId(saved.id)
      let syncSucceeded = false

      // Step 2: Sync agent
      if (syncOnSave) {
        setSyncStatus('syncing')
        try {
          const syncResp = await syncAgent(saved.id)
          if (syncResp.retell_error) {
            setSyncStatus('error')
            setSyncError(t('agentForm.syncErrorSaved', { detail: syncResp.retell_error }))
            setLoading(false)
            return
          }
          setSyncStatus('ok')
          syncSucceeded = true
        } catch (syncErr) {
          setSyncStatus('error')
          setSyncError(errText(syncErr.response?.data?.detail, syncErr.message))
          setLoading(false)
          return
        }
      }

      // Step 3: Upload KB if file selected
      if (kbFile) {
        setKbStatus('uploading')
        try {
          await uploadKnowledgeBase(saved.id, kbFile)
          setKbStatus('ok')
        } catch (kbErr) {
          setKbStatus('warning')
          setKbWarning(
            t('agentForm.kbUploadWarning', { detail: kbErr.response?.data?.detail || kbErr.message })
          )
          // Don't block — just warn, then close after delay
          setTimeout(() => onSaved(), 4000)
          setLoading(false)
          return
        }
      }

      // If the sync succeeded, keep the modal open so the user can jump straight
      // into a demo call with the agent they just configured, instead of losing
      // that context and having to find it again from the list.
      if (!syncSucceeded) {
        setTimeout(() => onSaved(), 800)
      }
      setLoading(false)
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail || err.response?.data || err.message
      console.error('[AgentForm] save error', status, detail, err)
      const msg = status ? t('agentForm.genericSaveError', { status, detail: JSON.stringify(detail) }) : t('agentForm.networkError', { msg: err.message })
      alert(msg)
      setLoading(false)
    }
  }

  const submitLabel = () => {
    if (!loading) return syncOnSave ? t('agentForm.saveSync') : t('agentForm.save')
    if (syncStatus === 'syncing') return t('agentForm.syncing')
    if (kbStatus === 'uploading') return t('agentForm.uploading')
    return t('agentForm.saving')
  }

  const agentNameOrDefault = form.agent_name || t('agentForm.defaultAgentName')
  const companyNameOrDefault = form.company_name || t('agentForm.defaultCompanyName')

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{agent ? t('agentForm.editTitle') : t('agentForm.newTitle')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Quick-start: describe the business, let Claude fill the form */}
          {!agent && (
            <div className="rounded-xl border border-z-blue/30 bg-z-blue/5 p-4 space-y-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                <SparklesIcon className="w-4 h-4 text-z-blue-light" />
                {t('agentForm.quickStartLabel')}
              </label>
              <textarea
                className="z-input w-full"
                rows={3}
                placeholder={t('agentForm.quickStartPlaceholder')}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={runGenerate}
                  disabled={generating || !description.trim()}
                  className="z-btn-primary text-sm disabled:opacity-50 flex items-center gap-1.5"
                >
                  {generating ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('agentForm.generating')}
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      {t('agentForm.generateAgent')}
                    </>
                  )}
                </button>
                <p className="text-xs text-slate-500">{t('agentForm.generateHint')}</p>
              </div>
              {generateError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <ExclamationCircleIcon className="w-3.5 h-3.5 flex-shrink-0" /> {generateError}
                </p>
              )}
            </div>
          )}

          {/* Score bar */}
          {(() => {
            const { score, warnings } = computeScore(form, t)
            return (
              <div className="rounded-xl border border-z-border bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">{t('agentForm.completeness')}</span>
                  <span className={`text-xs font-bold ${score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {score}% — {scoreLabel(score, t)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${scoreColor(score)}`} style={{ width: `${score}%` }} />
                </div>
                {warnings.length > 0 && (
                  <ul className="space-y-0.5">
                    {warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                        <ExclamationTriangleIcon className="w-3 h-3 mt-0.5 text-yellow-600 flex-shrink-0" />
                        {w}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })()}

          <div className="grid grid-cols-2 gap-4">
            <Field label={t('agentForm.internalName')} value={form.name} onChange={v => set('name', v)} required />
            <Field label={t('agentForm.callName')} value={form.agent_name} onChange={v => set('agent_name', v)} required />
          </div>
          <Field label={t('agentForm.company')} value={form.company_name} onChange={v => set('company_name', v)} required />
          <TextArea label={t('agentForm.companyInfo')} value={form.company_info} onChange={v => set('company_info', v)} placeholder={t('agentForm.companyInfoPlaceholder')} rows={3} />
          <TextArea label={t('agentForm.services')} value={form.services} onChange={v => set('services', v)} placeholder={t('agentForm.servicesPlaceholder')} rows={3} />

          {/* Sales strategy section */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-black/20 border-b border-z-border">
              <h3 className="text-sm font-medium text-slate-300">{t('agentForm.salesStrategyTitle')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{t('agentForm.salesStrategyHint')}</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('agentForm.callObjective')}</label>
                <select className="z-input" value={form.call_objective || ''} onChange={e => set('call_objective', e.target.value)}>
                  {CALL_OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">{t('agentForm.callObjectiveHint')}</p>
              </div>
              <TextArea
                label={t('agentForm.targetAudience')}
                value={form.target_audience || ''}
                onChange={v => set('target_audience', v)}
                placeholder={t('agentForm.targetAudiencePlaceholder')}
                rows={2}
              />
              <TextArea
                label={t('agentForm.customObjections')}
                value={form.custom_objections || ''}
                onChange={v => set('custom_objections', v)}
                placeholder={t('agentForm.customObjectionsPlaceholder')}
                rows={4}
              />
            </div>
          </div>

          {/* Voice & call behavior section */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-black/20 border-b border-z-border">
              <h3 className="text-sm font-medium text-slate-300">{t('agentForm.voiceAndBehaviorTitle')}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{t('agentForm.voiceAndBehaviorHint')}</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  {t('agentForm.voice')}
                  {voicesLoading && <span className="ml-2 text-xs text-slate-500">{t('agentForm.loadingCatalog')}</span>}
                </label>
                <div className="flex gap-2">
                  <select
                    className="z-input flex-1"
                    value={form.voice_id || 'retell-Andrea'}
                    onChange={e => set('voice_id', e.target.value)}
                  >
                    {voiceOptions.map(v => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={playPreview}
                    disabled={!previewUrl}
                    title={previewUrl ? t('agentForm.listenSample') : t('agentForm.noSample')}
                    className="z-btn-ghost px-3 disabled:opacity-40"
                  >
                    ▶
                  </button>
                </div>
                {voicesError && (
                  <p className="text-xs text-amber-400 mt-1">
                    {t('agentForm.catalogError')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('agentForm.language')}</label>
                  <select className="z-input" value={form.language} onChange={e => set('language', e.target.value)}>
                    <option value="español">{t('agentForm.spanishLatam')}</option>
                    <option value="english">{t('agentForm.englishUs')}</option>
                    <option value="bilingüe">{t('agentForm.bilingual')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">{t('agentForm.temperature')}</label>
                  <select className="z-input" value={form.temperature ?? 0.4} onChange={e => set('temperature', parseFloat(e.target.value))}>
                    {TEMPERATURES.map(temp => <option key={temp.value} value={temp.value}>{temp.label}</option>)}
                  </select>
                </div>
                <Field label={t('agentForm.maxDuration')} type="number" value={form.max_call_duration} onChange={v => set('max_call_duration', Number(v))} />
              </div>

              <TextArea
                label={t('agentForm.voicemailMsg')}
                value={form.voicemail_message || ''}
                onChange={v => set('voicemail_message', v)}
                placeholder={t('agentForm.voicemailPlaceholder', { agent: agentNameOrDefault, company: companyNameOrDefault })}
                rows={2}
              />
            </div>
          </div>

          {/* Outbound / Inbound tabs */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="flex">
              {[['outbound', t('agentForm.outboundCalls')], ['inbound', t('agentForm.inboundCalls')]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCallTab(key)}
                  className={`flex-1 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                    callTab === key
                      ? 'border-z-blue text-slate-100 bg-z-blue/10'
                      : 'border-transparent text-slate-500 bg-black/20 hover:text-slate-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-3">
              {callTab === 'outbound' && (
                <>
                  <TextArea
                    label={t('agentForm.outboundSystem')}
                    value={form.outbound_system_prompt || ''}
                    onChange={v => set('outbound_system_prompt', v)}
                    placeholder={t('agentForm.outboundSystemPlaceholder', { agent: form.agent_name || '{agent_name}', company: form.company_name || '{company_name}' })}
                    rows={5}
                  />
                  <TextArea
                    label={t('agentForm.outboundFirst')}
                    value={form.outbound_first_message || ''}
                    onChange={v => set('outbound_first_message', v)}
                    placeholder={t('agentForm.outboundFirstPlaceholder', { agent: form.agent_name || '{agent_name}', company: form.company_name || '{company_name}', customer: '{{customer_name}}' })}
                    rows={2}
                  />
                  <p className="text-xs text-slate-500">{t('agentForm.customerNameHint')}</p>
                </>
              )}

              {callTab === 'inbound' && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.inbound_enabled || false}
                      onChange={e => set('inbound_enabled', e.target.checked)}
                      className="w-4 h-4 accent-blue-500"
                    />
                    <span className="text-sm font-medium text-slate-300">{t('agentForm.enableInbound')}</span>
                  </label>

                  {form.inbound_enabled && (
                    <>
                      <p className="text-xs text-z-blue-light bg-z-blue/10 border border-z-blue/30 rounded-lg px-3 py-2">
                        {t('agentForm.inboundEnabledHint')}
                      </p>
                      <TextArea
                        label={t('agentForm.inboundSystem')}
                        value={form.inbound_system_prompt || ''}
                        onChange={v => set('inbound_system_prompt', v)}
                        placeholder={t('agentForm.inboundSystemPlaceholder', { agent: form.agent_name || '{agent_name}', company: form.company_name || '{company_name}' })}
                        rows={5}
                      />
                      <TextArea
                        label={t('agentForm.inboundFirst')}
                        value={form.inbound_first_message || ''}
                        onChange={v => set('inbound_first_message', v)}
                        placeholder={t('agentForm.inboundFirstPlaceholder', { agent: form.agent_name || '{agent_name}', company: form.company_name || '{company_name}' })}
                        rows={2}
                      />
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Knowledge Base */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-black/20 border-b border-z-border">
              <h3 className="text-sm font-medium text-slate-300">{t('agentForm.kbTitle')} <span className="text-slate-500 font-normal">{t('agentForm.optional')}</span></h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Existing KB indicator */}
              {agent?.retell_knowledge_base_id && !kbFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-xs text-green-400">{t('agentForm.fileUploaded')}</span>
                </div>
              )}

              {/* Drop zone */}
              {!kbFile ? (
                <div
                  onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl px-4 py-6 cursor-pointer transition-colors ${
                    isDragging
                      ? 'border-z-blue bg-z-blue/10'
                      : 'border-z-border hover:border-z-blue/50 hover:bg-white/[0.02]'
                  }`}
                >
                  <DocumentArrowUpIcon className="w-8 h-8 text-slate-500" />
                  <p className="text-sm text-slate-400 text-center">
                    {t('agentForm.dragFile')} <span className="text-z-blue-light">{t('agentForm.selectFile')}</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    {t('agentForm.fileTypes', { max: MAX_MB })}
                  </p>
                  <p className="text-xs text-slate-600 text-center">
                    {t('agentForm.fileHint')}
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.docx,.doc,.md,.csv"
                    className="hidden"
                    onChange={e => validateAndSetFile(e.target.files[0])}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2.5 bg-z-blue/10 border border-z-blue/30 rounded-lg">
                  <DocumentArrowUpIcon className="w-5 h-5 text-z-blue-light flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate font-medium">{kbFile.name}</p>
                    <p className="text-xs text-slate-500">{formatBytes(kbFile.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setKbFile(null); setKbFileError('') }}
                    className="text-slate-500 hover:text-red-400 flex-shrink-0"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}

              {kbFileError && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                  <ExclamationCircleIcon className="w-3.5 h-3.5 flex-shrink-0" /> {kbFileError}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} className="w-4 h-4 accent-yellow-500" />
              <span className="text-sm text-slate-300">{t('agentForm.defaultAgent')}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={syncOnSave} onChange={e => setSyncOnSave(e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">{t('agentForm.syncOnSave')}</span>
            </label>
          </div>

          {/* Status messages */}
          <div className="space-y-1.5">
            {syncStatus === 'syncing' && (
              <p className="text-sm text-z-blue-light">{t('agentForm.syncing')}</p>
            )}
            {syncStatus === 'ok' && kbStatus !== 'uploading' && kbStatus !== 'ok' && kbStatus !== 'warning' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircleIcon className="w-4 h-4" /> {t('agentForm.syncSuccess')}
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-400">
                <ExclamationCircleIcon className="w-4 h-4" /> {syncError}
              </span>
            )}
            {kbStatus === 'uploading' && (
              <p className="text-sm text-z-blue-light">{t('agentForm.uploading')}</p>
            )}
            {kbStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircleIcon className="w-4 h-4" /> {t('agentForm.syncedAndUploaded')}
              </span>
            )}
            {kbStatus === 'warning' && (
              <span className="flex items-center gap-1.5 text-sm text-amber-400">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" /> {kbWarning}
              </span>
            )}
            {syncStatus === 'ok' && savedAgentId && kbStatus !== 'uploading' && (
              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => navigate(`/demo?agent=${savedAgentId}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <PhoneIcon className="w-4 h-4" />
                  {t('agentForm.listenDemoNow')}
                </button>
                <button type="button" onClick={() => onSaved()} className="text-sm text-slate-400 hover:text-slate-200">
                  {t('agentForm.doneClose')}
                </button>
              </div>
            )}
          </div>

          {/* Prompt preview */}
          {agent?.id && (
            <div className="border border-z-border rounded-xl overflow-hidden">
              <button
                type="button"
                onClick={() => previewOpen ? setPreviewOpen(false) : loadPreview()}
                className="w-full flex items-center justify-between px-4 py-3 bg-black/20 hover:bg-white/[0.03] transition-colors"
              >
                <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <EyeIcon className="w-4 h-4" />
                  {t('agentForm.viewPrompt')}
                </span>
                {previewLoading
                  ? <span className="text-xs text-slate-500">{t('agentForm.loading')}</span>
                  : previewOpen ? <ChevronUpIcon className="w-4 h-4 text-slate-500" /> : <ChevronDownIcon className="w-4 h-4 text-slate-500" />
                }
              </button>
              {previewOpen && previewData && (
                <div className="p-4 space-y-3 border-t border-z-border">
                  <p className="text-xs text-slate-500">
                    {t('agentForm.promptPreviewHint')}
                  </p>
                  <textarea
                    readOnly
                    value={previewData.prompt}
                    rows={12}
                    className="z-input resize-none text-xs font-mono text-slate-300 bg-black/30"
                  />
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('agentForm.cancel')}</button>
            <button type="submit" disabled={loading || !!kbFileError} className="z-btn-primary disabled:opacity-50">
              {submitLabel()}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="z-input" />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="z-input resize-none" />
    </div>
  )
}
