import { useState, useEffect } from 'react'
import { Cog6ToothIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { Link } from 'react-router-dom'
import { getLeadHunterConfig, saveLeadHunterConfig } from '../api/client'

export default function LeadHunterConfig() {
  const [form, setForm] = useState({
    lh_target_description: '',
    lh_offer_description: '',
    lh_cities: '',
    lh_language: 'es',
    lh_channel: 'whatsapp',
    lh_active: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => {
    getLeadHunterConfig()
      .then(data => setForm(prev => ({ ...prev, ...data })))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    try {
      await saveLeadHunterConfig(form)
      setMsg({ ok: true, text: 'Configuración guardada' })
    } catch (e) {
      setMsg({ ok: false, text: e.response?.data?.detail || 'Error al guardar' })
    } finally { setSaving(false) }
  }

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  if (loading) return (
    <div className="p-6 text-sm text-slate-500">Cargando configuración...</div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            <MagnifyingGlassIcon className="w-6 h-6 text-blue-400" /> Lead Hunter
            <span className="text-slate-500 font-normal text-base">/ Configuración</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Define tu perfil de prospección para que la IA busque los clientes correctos</p>
        </div>
        <Link to="/lead-hunter"
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-z-border text-slate-400 hover:bg-white/5 transition-colors">
          ← Volver a Lead Hunter
        </Link>
      </div>

      {/* Active toggle */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-200">Activar Lead Hunter</p>
          <p className="text-xs text-slate-500 mt-0.5">Cuando está activo, puedes buscar leads automáticamente</p>
        </div>
        <button
          onClick={() => set('lh_active', !form.lh_active)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${form.lh_active ? 'bg-blue-600' : 'bg-slate-700'}`}
        >
          <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${form.lh_active ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Form */}
      <div className="bg-z-card rounded-xl border border-z-border p-5 space-y-5">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Cog6ToothIcon className="w-4 h-4 text-slate-400" /> Perfil de prospección
        </h2>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">
            ¿A quién le vendes? <span className="text-red-400">*</span>
          </label>
          <textarea
            value={form.lh_target_description}
            onChange={e => set('lh_target_description', e.target.value)}
            placeholder="ej: Dueños de pequeños negocios hispanos (restaurantes, barberías, tiendas) que no tienen presencia digital y necesitan más clientes"
            rows={3}
            className="z-input w-full text-sm resize-none"
          />
          <p className="text-xs text-slate-600 mt-1">La IA usará esto para generar búsquedas inteligentes en Google Maps</p>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">¿Qué ofreces?</label>
          <textarea
            value={form.lh_offer_description}
            onChange={e => set('lh_offer_description', e.target.value)}
            placeholder="ej: Páginas web profesionales desde $299 con dominio y hosting incluido, con garantía de resultados en 30 días"
            rows={2}
            className="z-input w-full text-sm resize-none"
          />
          <p className="text-xs text-slate-600 mt-1">Se incluye en el mensaje de prospección personalizado</p>
        </div>

        <div>
          <label className="text-xs text-slate-400 mb-1.5 block font-medium">
            Ciudades objetivo <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={form.lh_cities}
            onChange={e => set('lh_cities', e.target.value)}
            placeholder="Miami FL, Orlando FL, Tampa FL"
            className="z-input w-full text-sm"
          />
          <p className="text-xs text-slate-600 mt-1">Separa con comas. Se usarán hasta 3 ciudades por búsqueda.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Idioma del mensaje</label>
            <select
              value={form.lh_language}
              onChange={e => set('lh_language', e.target.value)}
              className="z-input w-full text-sm"
            >
              <option value="es">Solo español</option>
              <option value="en">Solo inglés</option>
              <option value="both">Español + inglés</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1.5 block font-medium">Canal de envío</label>
            <select
              value={form.lh_channel}
              onChange={e => set('lh_channel', e.target.value)}
              className="z-input w-full text-sm"
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="both">WhatsApp + Email</option>
            </select>
            {form.lh_channel !== 'whatsapp' && (
              <p className="text-xs text-amber-400/80 mt-1">
                ⚠ El envío por email requiere que el lead tenga un correo capturado. Google Maps no siempre lo entrega — podrás completarlo manualmente en la ficha del lead si falta.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving || !form.lh_target_description?.trim() || !form.lh_cities?.trim()}
          className="z-btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <><span className="animate-spin text-base">⟳</span> Guardando...</> : 'Guardar configuración'}
        </button>
        {msg && (
          <p className={`text-xs font-medium ${msg.ok ? 'text-green-400' : 'text-red-400'}`}>
            {msg.ok ? '✓' : '✗'} {msg.text}
          </p>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-4 text-xs text-slate-400 space-y-1">
        <p className="font-medium text-blue-400">¿Cómo funciona Lead Hunter?</p>
        <p>1. Claude AI genera 8 búsquedas específicas basadas en tu perfil</p>
        <p>2. Se buscan en Google Maps vía Outscraper en paralelo para todas tus ciudades</p>
        <p>3. Se filtran negocios con rating 3.0–4.6 ⭐ y 5–80 reseñas (el sweet spot)</p>
        <p>4. Claude personaliza un mensaje de WhatsApp para cada negocio</p>
        <p>5. Tú decides a quién enviar el mensaje con un clic</p>
      </div>
    </div>
  )
}
