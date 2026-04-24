import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getOrganizations, createOrganization, updateOrganization,
  getUsers, createUser, updateUser, deleteUser,
  testCRMWebhook, upgradeOrg,
} from '../api/client'

const ROLES = ['superadmin', 'admin', 'agent', 'viewer']
const PLANS = ['free', 'basic', 'pro']

const CRM_TYPES = [
  { value: 'none', label: 'Sin integración' },
  { value: 'zapier', label: 'Zapier' },
  { value: 'make', label: 'Make (Integromat)' },
  { value: 'gohighlevel', label: 'GoHighLevel' },
  { value: 'hubspot', label: 'HubSpot' },
  { value: 'monday', label: 'Monday.com' },
  { value: 'zoho', label: 'Zoho CRM' },
  { value: 'airtable', label: 'Airtable' },
  { value: 'notion', label: 'Notion' },
  { value: 'pipedrive', label: 'Pipedrive' },
  { value: 'salesforce', label: 'Salesforce' },
  { value: 'n8n', label: 'n8n' },
  { value: 'custom', label: 'Webhook personalizado' },
]

const CRM_PLACEHOLDERS = {
  zapier: 'https://hooks.zapier.com/hooks/catch/...',
  make: 'https://hook.make.com/...',
  n8n: 'https://tu-instancia-n8n.com/webhook/...',
  custom: 'https://tu-servidor.com/webhook',
}

const NATIVE_CRM_TYPES = ['monday', 'hubspot', 'gohighlevel', 'zoho', 'salesforce']

const NATIVE_CRM_LABELS = {
  monday:       { apiKey: 'API Key de Monday',        boardId: 'Board ID', boardIdPlaceholder: 'ej: 1234567890' },
  hubspot:      { apiKey: 'API Key de HubSpot',       boardId: 'Pipeline ID (opcional)', boardIdPlaceholder: 'ej: default' },
  gohighlevel:  { apiKey: 'API Key de GoHighLevel',   boardId: 'Location ID', boardIdPlaceholder: 'ej: abc123xyz' },
  zoho:         { apiKey: 'OAuth Token de Zoho',      boardId: null },
  salesforce:   { apiKey: 'Access Token de Salesforce', boardId: null },
}

const CRM_INSTRUCTIONS = {
  zapier: `1. Ve a zapier.com → "Create Zap"
2. Trigger: "Webhooks by Zapier" → "Catch Hook"
3. Copia la URL generada y pégala arriba
4. Action: conecta con tu CRM favorito (HubSpot, Salesforce, etc.)`,

  make: `1. Ve a make.com → "Create a new scenario"
2. Agrega el módulo "Webhooks" → "Custom Webhook"
3. Copia la URL generada y pégala arriba
4. Conecta con tu CRM en el módulo siguiente`,

  gohighlevel: `1. Ve a Settings → Integrations → Webhooks
2. Haz clic en "Add Webhook"
3. Pega la URL de ZyraVoice
4. Selecciona los eventos: Contact Created, Call Ended`,

  hubspot: `1. Ve a Settings → Integrations → Private Apps
2. Crea una app y copia el Webhook URL
3. O usa Zapier/Make como intermediario para mayor flexibilidad`,

  monday: `1. Ve a tu Board → Integrations → Webhooks
2. Crea un webhook entrante
3. Copia la URL generada y pégala arriba`,

  airtable: `1. Airtable no tiene webhooks nativos directos
2. Usa Make o Zapier como intermediario
3. En Make: módulo "Airtable" → "Create a Record"
4. En Zapier: Action → Airtable → "Create Record"`,

  notion: `1. Notion no tiene webhooks nativos
2. Usa Make o Zapier como intermediario
3. En Make: módulo "Notion" → "Create a Database Item"
4. En Zapier: Action → Notion → "Create Database Item"`,

  pipedrive: `1. Ve a Tools → Webhooks → "Add Webhook"
2. O usa Zapier para mayor flexibilidad
3. Copia la URL y pégala arriba`,

  salesforce: `1. Usa Zapier o Make como intermediario
2. En Zapier: Action → Salesforce → "Create Record"
3. Mapea los campos del payload de ZyraVoice`,

  n8n: `1. Crea un workflow → "Add first step" → "On webhook call"
2. Copia la URL de webhook generada
3. Pégala arriba y conecta con tu CRM en el siguiente nodo`,

  custom: `Tu servidor recibirá un POST con payload JSON de ZyraVoice.
Verifica la autenticidad con el header X-ZyraVoice-Signature (HMAC SHA-256).
Ejemplo: X-ZyraVoice-Signature: sha256=<hex>`,
}

const CRM_EVENTS_OPTIONS = [
  { value: 'call_ended', label: 'Llamada finalizada', always: true },
  { value: 'interested', label: 'Prospecto muestra interés' },
  { value: 'appointment_scheduled', label: 'Cita agendada' },
  { value: 'voicemail', label: 'Buzón de voz' },
  { value: 'failed', label: 'Llamada fallida' },
]

export default function Admin() {
  const [tab, setTab] = useState('orgs')
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)

  const loadOrgs = () => getOrganizations().then(setOrgs).catch(() => {})
  const loadUsers = () => getUsers().then(setUsers).catch(() => {})

  useEffect(() => { loadOrgs(); loadUsers() }, [])

  const handleDeleteUser = async (user) => {
    if (!confirm(`¿Desactivar a "${user.full_name}"?`)) return
    try { await deleteUser(user.id); loadUsers() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  const handleUpgrade = async (org) => {
    if (!confirm(`¿Actualizar "${org.name}" a plan Pro?`)) return
    try { await upgradeOrg(org.id); loadOrgs() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">Panel de Administración</h1>

      <div className="flex gap-1 bg-black/30 rounded-lg p-1 w-fit border border-z-border">
        {[['orgs', 'Organizaciones'], ['users', 'Usuarios']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-z-card text-slate-100 shadow' : 'text-slate-500 hover:text-slate-300'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'orgs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-200">Organizaciones</h2>
            <button onClick={() => setModal({ type: 'org', data: null })}
              className="z-btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> Nueva
            </button>
          </div>
          <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {['ID', 'Nombre', 'Plan', 'Demos', 'CRM', 'Activa', 'Acciones'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {orgs.map(org => (
                  <tr key={org.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-slate-500 text-xs">{org.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-200">{org.name}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        org.plan === 'free' ? 'bg-amber-500/15 text-amber-400' :
                        org.plan === 'pro'  ? 'bg-green-500/15 text-green-400' :
                                              'bg-z-blue/15 text-z-blue-light'
                      }`}>{org.plan}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs">
                      {org.plan === 'free' ? `${org.demo_calls_used ?? 0}/10` : '—'}
                    </td>
                    <td className="px-6 py-3">
                      {org.crm_type && org.crm_type !== 'none' ? (
                        <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                          org.crm_webhook_enabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-700 text-slate-400'
                        }`}>
                          {CRM_TYPES.find(c => c.value === org.crm_type)?.label || org.crm_type}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {org.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {org.plan === 'free' && (
                          <button onClick={() => handleUpgrade(org)}
                            className="px-2 py-0.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium rounded-lg transition-colors">
                            ⬆ Pro
                          </button>
                        )}
                        <button onClick={() => setModal({ type: 'org', data: org })}
                          className="text-slate-500 hover:text-slate-300">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-slate-500">No hay organizaciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-200">Usuarios</h2>
            <button onClick={() => setModal({ type: 'user', data: null })}
              className="z-btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> Nuevo
            </button>
          </div>
          <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {['Nombre', 'Email', 'Rol', 'Organización', 'Activo', 'Acciones'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-medium text-slate-200">{user.full_name}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{user.email}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full font-medium">{user.role}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{user.organization_name || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {user.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setModal({ type: 'user', data: user })}
                          className="text-slate-500 hover:text-slate-300">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteUser(user)}
                          className="text-slate-500 hover:text-red-400">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">No hay usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal?.type === 'org' && (
        <OrgModal
          org={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadOrgs() }}
        />
      )}
      {modal?.type === 'user' && (
        <UserModal
          user={modal.data}
          orgs={orgs}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); loadUsers() }}
        />
      )}
    </div>
  )
}

function OrgModal({ org, onClose, onSaved }) {
  const [form, setForm] = useState(org ? {
    ...org,
    crm_extra_config: (() => {
      try { return org.crm_extra_config ? JSON.parse(org.crm_extra_config) : null }
      catch { return null }
    })(),
  } : {
    name: '', plan: 'basic', retell_api_key: '', retell_phone_number: '',
    anthropic_api_key: '', is_active: true,
    crm_type: 'none', crm_webhook_url: '', crm_webhook_enabled: false,
    crm_webhook_secret: '', crm_events: '["call_ended","interested"]',
    crm_api_key: '', crm_board_or_list_id: '', crm_extra_config: null,
  })
  const [loading, setLoading] = useState(false)
  const [crmAccordionOpen, setCrmAccordionOpen] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setCrmExtra = (key, value) => set('crm_extra_config', { ...(form.crm_extra_config || {}), [key]: value })

  const getCrmEvents = () => {
    try { return JSON.parse(form.crm_events || '[]') }
    catch { return [] }
  }

  const toggleCrmEvent = (eventValue) => {
    const current = getCrmEvents()
    const next = current.includes(eventValue)
      ? current.filter(e => e !== eventValue)
      : [...current, eventValue]
    set('crm_events', JSON.stringify(next))
  }

  const handleTestWebhook = async () => {
    if (!org?.id) return
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await testCRMWebhook(org.id)
      setTestResult(res)
    } catch (err) {
      setTestResult({ success: false, response: err.response?.data?.detail || 'Error de conexión' })
    } finally {
      setTestLoading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    // Ensure call_ended is always in the events list
    const events = getCrmEvents()
    const withEvents = events.includes('call_ended')
      ? form
      : { ...form, crm_events: JSON.stringify(['call_ended', ...events]) }
    const finalForm = {
      ...withEvents,
      crm_extra_config: form.crm_extra_config ? JSON.stringify(form.crm_extra_config) : null,
    }
    try {
      if (org?.id) await updateOrganization(org.id, finalForm)
      else await createOrganization(finalForm)
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error')
      setLoading(false)
    }
  }

  const crmType = form.crm_type || 'none'
  const crmLabel = CRM_TYPES.find(c => c.value === crmType)?.label || crmType

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{org ? 'Editar Organización' : 'Nueva Organización'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nombre</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Plan</label>
            <select value={form.plan} onChange={e => set('plan', e.target.value)} className="z-input">
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Retell API Key</label>
            <input value={form.retell_api_key || ''} onChange={e => set('retell_api_key', e.target.value)} className="z-input font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Retell Phone Number</label>
            <input value={form.retell_phone_number || ''} onChange={e => set('retell_phone_number', e.target.value)}
              placeholder="+12345678901" className="z-input font-mono" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Anthropic API Key</label>
            <input value={form.anthropic_api_key || ''} onChange={e => set('anthropic_api_key', e.target.value)} className="z-input font-mono" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-slate-300">Organización activa</span>
          </label>

          {/* ── CRM Integration ─────────────────────────────────────────────── */}
          <div className="border-t border-z-border pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Integración CRM / Webhook
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Plataforma CRM</label>
              <select
                value={crmType}
                onChange={e => { set('crm_type', e.target.value); setTestResult(null) }}
                className="z-input"
              >
                {CRM_TYPES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            {crmType !== 'none' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!form.crm_webhook_enabled}
                    onChange={e => set('crm_webhook_enabled', e.target.checked)}
                    className="w-4 h-4 accent-blue-500"
                  />
                  <span className="text-sm text-slate-300">Activar envío al CRM</span>
                </label>

                {NATIVE_CRM_TYPES.includes(crmType) ? (
                  /* ── Native CRM fields ──────────────────────────────────── */
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        {NATIVE_CRM_LABELS[crmType]?.apiKey || 'API Key'}
                      </label>
                      <input
                        type="password"
                        value={form.crm_api_key || ''}
                        onChange={e => set('crm_api_key', e.target.value)}
                        placeholder="••••••••••••••••"
                        className="z-input font-mono"
                      />
                    </div>

                    {NATIVE_CRM_LABELS[crmType]?.boardId && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          {NATIVE_CRM_LABELS[crmType].boardId}
                        </label>
                        <input
                          type="text"
                          value={form.crm_board_or_list_id || ''}
                          onChange={e => set('crm_board_or_list_id', e.target.value)}
                          placeholder={NATIVE_CRM_LABELS[crmType].boardIdPlaceholder || ''}
                          className="z-input font-mono"
                        />
                      </div>
                    )}

                    {crmType === 'salesforce' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Instance URL</label>
                        <input
                          type="text"
                          value={form.crm_extra_config?.instance_url || ''}
                          onChange={e => setCrmExtra('instance_url', e.target.value)}
                          placeholder="https://miempresa.salesforce.com"
                          className="z-input font-mono text-xs"
                        />
                      </div>
                    )}
                  </>
                ) : (
                  /* ── Generic webhook fields (unchanged) ─────────────────── */
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">URL del Webhook</label>
                      <input
                        value={form.crm_webhook_url || ''}
                        onChange={e => { set('crm_webhook_url', e.target.value); setTestResult(null) }}
                        placeholder={CRM_PLACEHOLDERS[crmType] || 'https://...'}
                        className="z-input font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">
                        Secreto de firma{' '}
                        <span className="text-slate-500 font-normal">(opcional)</span>
                      </label>
                      <input
                        type="password"
                        value={form.crm_webhook_secret || ''}
                        onChange={e => set('crm_webhook_secret', e.target.value)}
                        placeholder="Clave para verificar firma HMAC SHA-256"
                        className="z-input font-mono"
                      />
                      <p className="text-xs text-slate-600 mt-1">
                        Tu CRM puede verificar el header <code className="text-slate-500">X-ZyraVoice-Signature</code>
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">Enviar datos cuando:</label>
                      <div className="space-y-1.5">
                        {CRM_EVENTS_OPTIONS.map(ev => (
                          <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ev.always || getCrmEvents().includes(ev.value)}
                              disabled={ev.always}
                              onChange={() => !ev.always && toggleCrmEvent(ev.value)}
                              className="w-4 h-4 accent-blue-500 disabled:opacity-60"
                            />
                            <span className="text-sm text-slate-300">{ev.label}</span>
                            {ev.always && <span className="text-xs text-slate-600">(siempre)</span>}
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Test connection */}
                    {form.crm_webhook_url && org?.id && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={handleTestWebhook}
                          disabled={testLoading}
                          className="z-btn-ghost border border-z-border text-sm disabled:opacity-50"
                        >
                          {testLoading ? 'Enviando prueba...' : 'Probar conexión'}
                        </button>
                        {testResult && (
                          <div className={`text-xs rounded-lg px-3 py-2 ${
                            testResult.success
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {testResult.success
                              ? `✓ Conexión exitosa (HTTP ${testResult.status_code}) — webhook recibido correctamente`
                              : `✗ Error ${testResult.status_code || ''}: ${testResult.response}`
                            }
                          </div>
                        )}
                      </div>
                    )}

                    {/* Instructions accordion */}
                    {CRM_INSTRUCTIONS[crmType] && (
                      <div className="border border-z-border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setCrmAccordionOpen(o => !o)}
                          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] transition-colors"
                        >
                          <span>Instrucciones para {crmLabel}</span>
                          <span className="text-slate-600 text-xs">{crmAccordionOpen ? '▲' : '▼'}</span>
                        </button>
                        {crmAccordionOpen && (
                          <div className="px-4 pb-4 border-t border-z-border pt-3">
                            <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
                              {CRM_INSTRUCTIONS[crmType]}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="z-btn-primary disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserModal({ user, orgs, onClose, onSaved }) {
  const [form, setForm] = useState(user || {
    email: '', password: '', full_name: '', role: 'agent', organization_id: orgs[0]?.id || null
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (user?.id) await updateUser(user.id, { full_name: form.full_name, role: form.role, organization_id: form.organization_id, is_active: form.is_active !== false })
      else await createUser(form)
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{user ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Nombre completo</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required className="z-input" />
          </div>
          {!user && <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className="z-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Contraseña</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required className="z-input" />
            </div>
          </>}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className="z-input">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Organización</label>
            <select value={form.organization_id || ''} onChange={e => set('organization_id', e.target.value ? Number(e.target.value) : null)} className="z-input">
              <option value="">Sin organización</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          {user && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active !== false} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">Usuario activo</span>
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">Cancelar</button>
            <button type="submit" disabled={loading} className="z-btn-primary disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
