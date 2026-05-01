import { useState, useRef } from 'react'
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon, DocumentArrowUpIcon, ExclamationTriangleIcon, EyeIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'
import { createAgent, updateAgent, syncAgent, uploadKnowledgeBase, getAgentPromptPreview } from '../api/client'

const VOICES = [
  { value: 'retell-Andrea',    label: 'Andrea (Mexicana · Adulta)' },
  { value: 'retell-Claudia',   label: 'Claudia (Mexicana · Adulta)' },
  { value: 'retell-Gaby',      label: 'Gaby (Mexicana · Joven)' },
  { value: 'retell-Alejandro', label: 'Alejandro (Mexicano · Joven · Masculino)' },
  { value: 'retell-Brynne',    label: 'Brynne (Americana · Adulta)' },
  { value: 'retell-Chloe',     label: 'Chloe (Americana · Joven)' },
  { value: 'retell-Grace',     label: 'Grace (Americana · Adulta)' },
  { value: 'retell-Rita',      label: 'Rita (Americana · Joven)' },
]

const TEMPERATURES = [
  { value: 0.7, label: 'Creativo (0.7)' },
  { value: 0.4, label: 'Balanceado (0.4)' },
  { value: 0.2, label: 'Preciso (0.2)' },
]

const ALLOWED_EXTS = ['.pdf', '.txt', '.docx', '.doc', '.md', '.csv']
const MAX_MB = 10

const CALL_OBJECTIVES = [
  { value: '', label: 'Sin definir' },
  { value: 'agendar_cita', label: 'Agendar una cita' },
  { value: 'calificar_interes', label: 'Calificar interés' },
  { value: 'cerrar_venta', label: 'Cerrar venta directa' },
  { value: 'informar_promocion', label: 'Informar una promoción' },
]

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

function computeScore(form) {
  let score = 15 // required fields always filled
  const warnings = []
  const infoLen = (form.company_info || '').length
  if (infoLen > 100) score += 15
  else if (infoLen > 20) { score += 7; warnings.push('Info de empresa muy corta — amplíala para darle más contexto al agente') }
  else warnings.push('Falta información de la empresa')

  const svcLen = (form.services || '').length
  if (svcLen > 100) score += 15
  else if (svcLen > 20) { score += 7; warnings.push('Descripción de servicios muy corta') }
  else warnings.push('Falta descripción de servicios')

  if (form.target_audience) score += 15
  else warnings.push('Sin público objetivo — el agente no puede calificar prospectos')

  if (form.call_objective) score += 15
  else warnings.push('Sin objetivo de llamada — el agente no sabe cuándo intentar cerrar')

  if (form.custom_objections) score += 10
  else warnings.push('Sin objeciones personalizadas — usará respuestas genéricas')

  if (form.voicemail_message) score += 5
  else warnings.push('Sin mensaje de buzón de voz configurado')

  if (form.outbound_first_message) score += 5

  return { score: Math.min(score, 100), warnings }
}

function scoreColor(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 50) return 'bg-yellow-500'
  return 'bg-red-500'
}

function scoreLabel(score) {
  if (score >= 80) return 'Agente bien configurado'
  if (score >= 50) return 'Configuración básica'
  return 'Configuración incompleta'
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function AgentFormModal({ agent, onClose, onSaved }) {
  const [form, setForm] = useState(agent ? { ...EMPTY, ...agent } : { ...EMPTY })
  const [syncOnSave, setSyncOnSave] = useState(true)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null)
  const [syncError, setSyncError] = useState('')
  const [callTab, setCallTab] = useState('outbound')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)

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
      alert('No se pudo cargar la vista previa: ' + (e.response?.data?.detail || e.message))
    } finally {
      setPreviewLoading(false)
    }
  }

  const validateAndSetFile = (file) => {
    setKbFileError('')
    if (!file) return
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTS.includes(ext)) {
      setKbFileError(`Formato no permitido. Usa: ${ALLOWED_EXTS.join(', ')}`)
      return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setKbFileError(`El archivo supera el límite de ${MAX_MB} MB`)
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

      // Step 2: Sync agent
      if (syncOnSave) {
        setSyncStatus('syncing')
        try {
          const syncResp = await syncAgent(saved.id)
          if (syncResp.retell_error) {
            setSyncStatus('error')
            setSyncError('Agente guardado, pero ocurrió un error al sincronizar: ' + syncResp.retell_error)
            setLoading(false)
            return
          }
          setSyncStatus('ok')
        } catch (syncErr) {
          setSyncStatus('error')
          setSyncError(syncErr.response?.data?.detail || syncErr.message)
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
            'Agente creado correctamente, pero el documento no se pudo subir. ' +
            'Puedes subirlo desde Editar agente. Detalle: ' +
            (kbErr.response?.data?.detail || kbErr.message)
          )
          // Don't block — just warn, then close after delay
          setTimeout(() => onSaved(), 4000)
          setLoading(false)
          return
        }
      }

      setTimeout(() => onSaved(), 800)
    } catch (err) {
      const status = err.response?.status
      const detail = err.response?.data?.detail || err.response?.data || err.message
      console.error('[AgentForm] save error', status, detail, err)
      const msg = status ? `Error ${status}: ${JSON.stringify(detail)}` : `Error de red: ${err.message}`
      alert(msg)
      setLoading(false)
    }
  }

  const submitLabel = () => {
    if (!loading) return syncOnSave ? 'Guardar y sincronizar' : 'Guardar'
    if (syncStatus === 'syncing') return 'Sincronizando...'
    if (kbStatus === 'uploading') return 'Subiendo documento...'
    return 'Guardando...'
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{agent ? 'Editar Agente' : 'Nuevo Agente'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Score bar */}
          {(() => {
            const { score, warnings } = computeScore(form)
            return (
              <div className="rounded-xl border border-z-border bg-black/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400">Completitud del agente</span>
                  <span className={`text-xs font-bold ${score >= 80 ? 'text-green-400' : score >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {score}% — {scoreLabel(score)}
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
            <Field label="Nombre interno" value={form.name} onChange={v => set('name', v)} required />
            <Field label="Nombre en llamada" value={form.agent_name} onChange={v => set('agent_name', v)} required />
          </div>
          <Field label="Empresa" value={form.company_name} onChange={v => set('company_name', v)} required />
          <TextArea label="Info de la empresa" value={form.company_info} onChange={v => set('company_info', v)} placeholder="Historia, valores, a quién sirven..." rows={3} />
          <TextArea label="Servicios y precios" value={form.services} onChange={v => set('services', v)} placeholder="Lista servicios con precios..." rows={3} />

          {/* Sales strategy section */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-black/20 border-b border-z-border">
              <h3 className="text-sm font-medium text-slate-300">Estrategia de ventas</h3>
              <p className="text-xs text-slate-500 mt-0.5">Cuanto más completes esta sección, mejor actuará el agente en llamadas reales.</p>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Objetivo principal de la llamada</label>
                <select className="z-input" value={form.call_objective || ''} onChange={e => set('call_objective', e.target.value)}>
                  {CALL_OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">El agente ajustará su cierre según este objetivo.</p>
              </div>
              <TextArea
                label="Público objetivo / cliente ideal"
                value={form.target_audience || ''}
                onChange={v => set('target_audience', v)}
                placeholder="Ej: Dueños de PYMES de 5-50 empleados en México que buscan reducir costos operativos. Edad 35-55, toman decisiones de compra directamente."
                rows={2}
              />
              <TextArea
                label="Objeciones frecuentes y cómo responderlas"
                value={form.custom_objections || ''}
                onChange={v => set('custom_objections', v)}
                placeholder={'Ej:\n- "Ya tenemos sistema propio": Qué bueno que invierten en tecnología. ¿Les gustaría ver cómo podemos integrarnos con lo que ya tienen?\n- "No tenemos presupuesto": Entiendo. ¿Puedo preguntarle qué pasaría si este problema no se resuelve?'}
                rows={4}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Voz del agente</label>
              <select className="z-input" value={form.voice_id || 'retell-Andrea'} onChange={e => set('voice_id', e.target.value)}>
                {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Temperatura del modelo</label>
              <select className="z-input" value={form.temperature ?? 0.4} onChange={e => set('temperature', parseFloat(e.target.value))}>
                {TEMPERATURES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Idioma</label>
              <select className="z-input" value={form.language} onChange={e => set('language', e.target.value)}>
                <option value="español">Español</option>
                <option value="english">English</option>
                <option value="bilingüe">Bilingüe</option>
              </select>
            </div>
            <Field label="Duración máx. (seg)" type="number" value={form.max_call_duration} onChange={v => set('max_call_duration', Number(v))} />
          </div>

          <TextArea
            label="Mensaje de voicemail"
            value={form.voicemail_message || ''}
            onChange={v => set('voicemail_message', v)}
            placeholder={`Hola, le llama ${form.agent_name || 'el agente'} de ${form.company_name || 'la empresa'}. Por favor comuníquese con nosotros cuando pueda. Gracias.`}
            rows={2}
          />

          {/* Outbound / Inbound tabs */}
          <div className="border border-z-border rounded-xl overflow-hidden">
            <div className="flex">
              {[['outbound', 'Llamadas Salientes'], ['inbound', 'Llamadas Entrantes']].map(([key, label]) => (
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
                    label="Sistema del agente (saliente)"
                    value={form.outbound_system_prompt || ''}
                    onChange={v => set('outbound_system_prompt', v)}
                    placeholder={`Eres ${form.agent_name || '{agent_name}'}, asesora virtual de ${form.company_name || '{company_name}'}. Llamas proactivamente para ofrecer servicios. Preséntate al inicio, escucha la situación del cliente y ofrece el servicio más adecuado.\n\nSi lo dejas vacío, se genera automáticamente desde Info de la empresa + Servicios.`}
                    rows={5}
                  />
                  <TextArea
                    label="Primer mensaje (saliente)"
                    value={form.outbound_first_message || ''}
                    onChange={v => set('outbound_first_message', v)}
                    placeholder={`Hola, buenos días. Habla ${form.agent_name || '{agent_name}'} de ${form.company_name || '{company_name}'}, ¿estoy hablando con {{customer_name}}?`}
                    rows={2}
                  />
                  <p className="text-xs text-slate-500">Usa &#123;&#123;customer_name&#125;&#125; para el nombre del cliente. Si lo dejas vacío se genera automáticamente.</p>
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
                    <span className="text-sm font-medium text-slate-300">Activar llamadas entrantes</span>
                  </label>

                  {form.inbound_enabled && (
                    <>
                      <p className="text-xs text-z-blue-light bg-z-blue/10 border border-z-blue/30 rounded-lg px-3 py-2">
                        Se configurará un agente separado para llamadas entrantes y se asignará al número al sincronizar.
                      </p>
                      <TextArea
                        label="Sistema del agente (entrante)"
                        value={form.inbound_system_prompt || ''}
                        onChange={v => set('inbound_system_prompt', v)}
                        placeholder={`Eres ${form.agent_name || '{agent_name}'} de ${form.company_name || '{company_name}'}. Atiendes llamadas entrantes de clientes que necesitan ayuda. Escucha su necesidad y ofrece el servicio correcto.`}
                        rows={5}
                      />
                      <TextArea
                        label="Primer mensaje (entrante)"
                        value={form.inbound_first_message || ''}
                        onChange={v => set('inbound_first_message', v)}
                        placeholder={`Hola, gracias por llamar a ${form.company_name || '{company_name}'}. Mi nombre es ${form.agent_name || '{agent_name}'}, ¿en qué le puedo ayudar hoy?`}
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
              <h3 className="text-sm font-medium text-slate-300">Base de Conocimiento <span className="text-slate-500 font-normal">(opcional)</span></h3>
            </div>
            <div className="p-4 space-y-3">
              {/* Existing KB indicator */}
              {agent?.retell_knowledge_base_id && !kbFile && (
                <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  <span className="text-xs text-green-400">Documento cargado correctamente</span>
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
                    Arrastra un archivo aquí o <span className="text-z-blue-light">selecciona uno</span>
                  </p>
                  <p className="text-xs text-slate-600">
                    PDF, TXT, DOCX, MD, CSV · máximo {MAX_MB} MB
                  </p>
                  <p className="text-xs text-slate-600 text-center">
                    Sube documentos con información de tu empresa. El agente los usará durante las llamadas.
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
              <span className="text-sm text-slate-300">Agente por defecto</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={syncOnSave} onChange={e => setSyncOnSave(e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">Sincronizar al guardar</span>
            </label>
          </div>

          {/* Status messages */}
          <div className="space-y-1.5">
            {syncStatus === 'syncing' && (
              <p className="text-sm text-z-blue-light">Sincronizando...</p>
            )}
            {syncStatus === 'ok' && kbStatus !== 'uploading' && kbStatus !== 'ok' && kbStatus !== 'warning' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircleIcon className="w-4 h-4" /> Sincronizado correctamente
              </span>
            )}
            {syncStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-sm text-red-400">
                <ExclamationCircleIcon className="w-4 h-4" /> {syncError}
              </span>
            )}
            {kbStatus === 'uploading' && (
              <p className="text-sm text-z-blue-light">Subiendo documento...</p>
            )}
            {kbStatus === 'ok' && (
              <span className="flex items-center gap-1.5 text-sm text-green-400">
                <CheckCircleIcon className="w-4 h-4" /> Agente sincronizado y documento subido correctamente
              </span>
            )}
            {kbStatus === 'warning' && (
              <span className="flex items-center gap-1.5 text-sm text-amber-400">
                <ExclamationTriangleIcon className="w-4 h-4 flex-shrink-0" /> {kbWarning}
              </span>
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
                  Ver prompt generado
                </span>
                {previewLoading
                  ? <span className="text-xs text-slate-500">Cargando...</span>
                  : previewOpen ? <ChevronUpIcon className="w-4 h-4 text-slate-500" /> : <ChevronDownIcon className="w-4 h-4 text-slate-500" />
                }
              </button>
              {previewOpen && previewData && (
                <div className="p-4 space-y-3 border-t border-z-border">
                  <p className="text-xs text-slate-500">
                    Este es el texto exacto que recibe el agente. Guarda y sincroniza para que los cambios se reflejen aquí.
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
            <button type="button" onClick={onClose} className="z-btn-ghost">Cancelar</button>
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
