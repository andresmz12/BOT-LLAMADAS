import { useState } from 'react'
import { XMarkIcon, CheckCircleIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline'
import { createAgent, updateAgent, syncAgent } from '../api/client'

const VOICES = [
  { value: 'DaliaMultilingual', label: 'Dalia Multilingual (ES recomendada)' },
  { value: 'Paloma', label: 'Paloma (ES-US)' },
  { value: 'Jenny', label: 'Jenny (Multilingüe)' },
]

const TEMPERATURES = [
  { value: 0.7, label: 'Creativo (0.7)' },
  { value: 0.4, label: 'Balanceado (0.4)' },
  { value: 0.2, label: 'Preciso (0.2)' },
]

const EMPTY = {
  name: '', agent_name: '', company_name: '', company_info: '',
  services: '', instructions: '', language: 'español',
  max_call_duration: 180, is_default: false,
  voice_id: 'DaliaMultilingual',
  first_message_override: '',
  voicemail_message: '',
  temperature: 0.4,
}

export default function AgentFormModal({ agent, onClose, onSaved }) {
  // Merge with EMPTY so existing agents always have defaults for new fields
  const [form, setForm] = useState(agent ? { ...EMPTY, ...agent } : { ...EMPTY })
  const [syncOnSave, setSyncOnSave] = useState(true)
  const [loading, setLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState(null) // null | 'syncing' | 'ok' | 'error'
  const [syncError, setSyncError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setSyncStatus(null)
    try {
      let saved
      if (agent?.id) {
        saved = await updateAgent(agent.id, form)
      } else {
        saved = await createAgent(form)
      }

      if (syncOnSave) {
        setSyncStatus('syncing')
        try {
          const syncResp = await syncAgent(saved.id)
          if (syncResp.vapi_error) {
            setSyncStatus('error')
            setSyncError('Agente guardado, pero error al sincronizar con VAPI: ' + syncResp.vapi_error)
            setLoading(false)
          } else {
            setSyncStatus('ok')
            setTimeout(() => onSaved(), 800)
          }
        } catch (syncErr) {
          setSyncStatus('error')
          setSyncError(syncErr.response?.data?.detail || syncErr.message)
          setLoading(false)
        }
      } else {
        onSaved()
      }
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-lg font-bold">{agent ? 'Editar Agente' : 'Nuevo Agente'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-gray-400" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">

          {/* Identidad */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre interno" value={form.name} onChange={v => set('name', v)} required />
            <Field label="Nombre en llamada" value={form.agent_name} onChange={v => set('agent_name', v)} required />
          </div>
          <Field label="Empresa" value={form.company_name} onChange={v => set('company_name', v)} required />
          <TextArea label="Info de la empresa" value={form.company_info} onChange={v => set('company_info', v)} placeholder="Historia, valores, a quién sirven..." rows={4} />
          <TextArea label="Servicios y precios" value={form.services} onChange={v => set('services', v)} placeholder="Lista servicios con precios..." rows={4} />
          <TextArea label="Instrucciones de comportamiento" value={form.instructions} onChange={v => set('instructions', v)} placeholder="Tono, cómo saludar, qué ofrecer..." rows={4} />

          {/* Voz y duración */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Voz del agente</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
                value={form.voice_id || 'DaliaMultilingual'}
                onChange={e => set('voice_id', e.target.value)}
              >
                {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temperatura del modelo</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
                value={form.temperature ?? 0.4}
                onChange={e => set('temperature', parseFloat(e.target.value))}
              >
                {TEMPERATURES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
                value={form.language}
                onChange={e => set('language', e.target.value)}
              >
                <option value="español">Español</option>
                <option value="english">English</option>
                <option value="bilingüe">Bilingüe</option>
              </select>
            </div>
            <Field label="Duración máx. (seg)" type="number" value={form.max_call_duration} onChange={v => set('max_call_duration', Number(v))} />
          </div>

          {/* Mensajes */}
          <TextArea
            label="Mensaje de bienvenida (opcional)"
            value={form.first_message_override || ''}
            onChange={v => set('first_message_override', v)}
            placeholder={`Hola, buenos días. Habla ${form.agent_name || 'el agente'} de ${form.company_name || 'la empresa'}, ¿estoy hablando con {customerName}?`}
            rows={3}
          />
          <p className="text-xs text-gray-400 -mt-2">Puedes usar &#123;&#123;customerName&#125;&#125; para insertar el nombre del cliente. Si lo dejas vacío se genera automáticamente.</p>

          <TextArea
            label="Mensaje de voicemail"
            value={form.voicemail_message || ''}
            onChange={v => set('voicemail_message', v)}
            placeholder={`Hola, le llama ${form.agent_name || 'el agente'} de ${form.company_name || 'la empresa'}. Por favor comuníquese con nosotros cuando pueda. Gracias.`}
            rows={2}
          />

          {/* Opciones */}
          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} className="w-4 h-4 accent-yellow-500" />
              <span className="text-sm text-gray-700">Agente por defecto</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={syncOnSave} onChange={e => setSyncOnSave(e.target.checked)} className="w-4 h-4 accent-yellow-500" />
              <span className="text-sm text-gray-700">Sincronizar con VAPI al guardar</span>
            </label>
          </div>

          {/* Sync status */}
          {syncStatus === 'syncing' && (
            <p className="text-sm text-blue-600">Sincronizando con VAPI...</p>
          )}
          {syncStatus === 'ok' && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircleIcon className="w-4 h-4" /> Sincronizado con VAPI correctamente
            </span>
          )}
          {syncStatus === 'error' && (
            <span className="flex items-center gap-1.5 text-sm text-red-600">
              <ExclamationCircleIcon className="w-4 h-4" /> Error al sincronizar: {syncError}
            </span>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {loading
                ? (syncStatus === 'syncing' ? 'Sincronizando...' : 'Guardando...')
                : (syncOnSave ? 'Guardar y sincronizar' : 'Guardar')}
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold" />
    </div>
  )
}

function TextArea({ label, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold focus:ring-1 focus:ring-gold resize-none" />
    </div>
  )
}
