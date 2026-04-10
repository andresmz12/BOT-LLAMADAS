import { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createAgent, updateAgent } from '../api/client'

const EMPTY = {
  name: '', agent_name: '', company_name: '', company_info: '',
  services: '', instructions: '', language: 'español',
  max_call_duration: 180, is_default: false, voice_id: '',
}

export default function AgentFormModal({ agent, onClose, onSaved }) {
  const [form, setForm] = useState(agent ? { ...agent } : { ...EMPTY })
  const [loading, setLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      agent?.id ? await updateAgent(agent.id, form) : await createAgent(form)
      onSaved()
    } catch (err) {
      alert('Error: ' + (err.response?.data?.detail || err.message))
    } finally {
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
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nombre interno" value={form.name} onChange={v => set('name', v)} required />
            <Field label="Nombre en llamada" value={form.agent_name} onChange={v => set('agent_name', v)} required />
          </div>
          <Field label="Empresa" value={form.company_name} onChange={v => set('company_name', v)} required />
          <TextArea label="Info de la empresa" value={form.company_info} onChange={v => set('company_info', v)} placeholder="Historia, valores, a quién sirven..." rows={4} />
          <TextArea label="Servicios y precios" value={form.services} onChange={v => set('services', v)} placeholder="Lista servicios con precios..." rows={4} />
          <TextArea label="Instrucciones de comportamiento" value={form.instructions} onChange={v => set('instructions', v)} placeholder="Tono, cómo saludar, qué ofrecer..." rows={4} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gold"
                value={form.language} onChange={e => set('language', e.target.value)}>
                <option value="español">Español</option>
                <option value="english">English</option>
                <option value="bilingüe">Bilingüe</option>
              </select>
            </div>
            <Field label="Duración máx. (seg)" type="number" value={form.max_call_duration} onChange={v => set('max_call_duration', Number(v))} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_default} onChange={e => set('is_default', e.target.checked)} className="w-4 h-4 accent-yellow-500" />
            <span className="text-sm text-gray-700">Agente por defecto</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Cancelar</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-gold hover:bg-gold-dark text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
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
