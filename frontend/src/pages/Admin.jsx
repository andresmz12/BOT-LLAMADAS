import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline'
import {
  getOrganizations, createOrganization, updateOrganization, deleteOrganization,
  getUsers, createUser, updateUser, deleteUser,
  testCRMWebhook, upgradeOrg, getOrgSecrets, getAuditLog,
} from '../api/client'
import SecretInput from '../components/SecretInput'
import { fmtDate } from '../utils/date'

const AUDIT_ACTION_COLOR = (action) => {
  if (action.endsWith('.delete') || action === 'user.delete') return 'bg-red-500/15 text-red-400'
  if (action.endsWith('.create')) return 'bg-green-500/15 text-green-400'
  if (action === 'login' || action === 'logout') return 'bg-slate-700 text-slate-300'
  if (action === 'settings.credentials_update' || action === 'org.upgrade') return 'bg-amber-500/15 text-amber-400'
  return 'bg-blue-500/15 text-blue-400'
}

const ROLES = ['superadmin', 'admin', 'agent']
const PLANS = ['free', 'starter', 'pro', 'enterprise']

const CRM_TYPE_VALUES = ['none', 'zapier', 'make', 'gohighlevel', 'hubspot', 'monday', 'zoho', 'airtable', 'notion', 'pipedrive', 'salesforce', 'n8n', 'custom']

const CRM_PLACEHOLDERS = {
  zapier: 'https://hooks.zapier.com/hooks/catch/...',
  make: 'https://hook.make.com/...',
  n8n: 'https://tu-instancia-n8n.com/webhook/...',
  custom: 'https://tu-servidor.com/webhook',
}

const NATIVE_CRM_TYPES = ['monday', 'hubspot', 'gohighlevel', 'zoho', 'salesforce']

const CRM_EVENTS_VALUES = [
  { value: 'call_ended', always: true },
  { value: 'interested' },
  { value: 'appointment_scheduled' },
  { value: 'voicemail' },
  { value: 'failed' },
  { value: 'campaign_email_sent' },
]

export default function Admin() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [tab, setTab] = useState('orgs')
  const [orgs, setOrgs] = useState([])
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)
  const [dataMenuOrgId, setDataMenuOrgId] = useState(null)
  const [dataMenuPos, setDataMenuPos] = useState({ top: 0, left: 0 })

  const ORG_DATA_LINKS = [
    [t('agents.title'), '/agents'],
    [t('calls.title'), '/calls'],
    [t('prospects.title'), '/prospects'],
    [t('campaigns.title'), '/campaigns'],
  ]

  const AUDIT_ACTION_LABELS = t('admin.audit.actions', { returnObjects: true })

  const toggleDataMenu = (org, e) => {
    if (dataMenuOrgId === org.id) { setDataMenuOrgId(null); return }
    const rect = e.currentTarget.getBoundingClientRect()
    setDataMenuPos({ top: rect.bottom + 4, left: rect.left })
    setDataMenuOrgId(org.id)
  }

  const goToOrgData = (org, path) => {
    setDataMenuOrgId(null)
    navigate(`${path}?org=${org.id}&orgName=${encodeURIComponent(org.name)}`)
  }

  const [auditLog, setAuditLog] = useState([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditFilterOrg, setAuditFilterOrg] = useState('')
  const [auditFilterAction, setAuditFilterAction] = useState('')

  const loadOrgs = () => getOrganizations().then(setOrgs).catch(() => {})
  const loadUsers = () => getUsers().then(setUsers).catch(() => {})
  const loadAuditLog = () => {
    setAuditLoading(true)
    const params = {}
    if (auditFilterOrg) params.organization_id = auditFilterOrg
    if (auditFilterAction) params.action = auditFilterAction
    getAuditLog(params).then(setAuditLog).catch(() => setAuditLog([])).finally(() => setAuditLoading(false))
  }

  useEffect(() => { loadOrgs(); loadUsers() }, [])
  useEffect(() => { if (tab === 'audit') loadAuditLog() }, [tab, auditFilterOrg, auditFilterAction])

  const handleDeleteUser = async (user) => {
    if (!confirm(t('admin.users.confirmDelete', { name: user.full_name, email: user.email }))) return
    try { await deleteUser(user.id); loadUsers() }
    catch (err) { alert(err.response?.data?.detail || t('admin.errorGeneric')) }
  }

  const handleDeleteOrg = async (org) => {
    if (!confirm(t('admin.orgs.confirmDelete', { name: org.name }))) return
    try { await deleteOrganization(org.id); loadOrgs() }
    catch (err) { alert(err.response?.data?.detail || t('admin.orgs.errorDelete')) }
  }

  const handleUpgrade = async (org) => {
    const plan = prompt(t('admin.orgs.upgradePrompt', { name: org.name }), org.plan || 'pro')
    if (!plan) return
    try { await upgradeOrg(org.id, plan.trim().toLowerCase()); loadOrgs() }
    catch (err) { alert(err.response?.data?.detail || t('admin.errorGeneric')) }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-slate-100">{t('admin.title')}</h1>

      <div className="flex gap-1 bg-black/30 rounded-lg p-1 w-fit border border-z-border">
        {[['orgs', t('admin.tabOrgs')], ['users', t('admin.tabUsers')], ['audit', t('admin.tabAudit')]].map(([key, label]) => (
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
            <h2 className="text-lg font-semibold text-slate-200">{t('admin.orgs.title')}</h2>
            <button onClick={() => setModal({ type: 'org', data: null })}
              className="z-btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> {t('admin.orgs.new')}
            </button>
          </div>
          <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {[t('admin.orgs.headers.id'), t('admin.orgs.headers.name'), t('admin.orgs.headers.contact'), t('admin.orgs.headers.plan'), t('admin.orgs.headers.demos'), t('admin.orgs.headers.crm'), t('admin.orgs.headers.active'), t('admin.orgs.headers.actions')].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {orgs.map(org => {
                  const contact = users.find(u => u.organization_id === org.id)
                  return (
                  <tr key={org.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-slate-500 text-xs">{org.id}</td>
                    <td className="px-6 py-3 font-medium text-slate-200">{org.name}</td>
                    <td className="px-6 py-3 text-xs">
                      {contact ? (
                        <div>
                          <div className="text-slate-300">{contact.full_name}</div>
                          <div className="text-slate-500">{contact.email}</div>
                          <div className="text-slate-500">{contact.phone || '—'}</div>
                          <div className="text-slate-600">{t('admin.orgs.since', { date: fmtDate(contact.created_at) })}</div>
                        </div>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                        org.plan === 'free' ? 'bg-slate-700/60 text-slate-400'
                        : org.plan === 'starter' ? 'bg-blue-500/15 text-blue-400'
                        : org.plan === 'enterprise' ? 'bg-purple-500/15 text-purple-400'
                        : 'bg-green-500/15 text-green-400'
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
                          {t(`admin.crmTypes.${org.crm_type}`, { defaultValue: org.crm_type })}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {org.is_active ? t('admin.orgs.active') : t('admin.orgs.inactive')}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => toggleDataMenu(org, e)}
                          onBlur={() => setTimeout(() => setDataMenuOrgId(null), 150)}
                          title={t('admin.orgs.viewDataTitle')}
                          className="text-slate-500 hover:text-slate-300"
                        >
                          <EyeIcon className="w-4 h-4" />
                        </button>
                        {dataMenuOrgId === org.id && (
                          <div
                            style={{ position: 'fixed', top: dataMenuPos.top, left: dataMenuPos.left }}
                            className="w-36 bg-z-card border border-z-border rounded-lg shadow-lg z-50 overflow-hidden"
                          >
                            {ORG_DATA_LINKS.map(([label, path]) => (
                              <button
                                key={path}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => goToOrgData(org, path)}
                                className="block w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        )}
                        {org.plan !== 'enterprise' && (
                          <button onClick={() => handleUpgrade(org)}
                            className="px-2 py-0.5 bg-green-500/15 hover:bg-green-500/25 text-green-400 text-xs font-medium rounded-lg transition-colors">
                            {t('admin.orgs.planBtn')}
                          </button>
                        )}
                        <button onClick={() => setModal({ type: 'org', data: org })}
                          className="text-slate-500 hover:text-slate-300">
                          <PencilIcon className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteOrg(org)}
                          className="text-slate-500 hover:text-red-400">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
                {orgs.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-500">{t('admin.orgs.noOrgs')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-slate-200">{t('admin.users.title')}</h2>
            <button onClick={() => setModal({ type: 'user', data: null })}
              className="z-btn-primary flex items-center gap-2">
              <PlusIcon className="w-4 h-4" /> {t('admin.users.new')}
            </button>
          </div>
          <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {[t('admin.users.headers.name'), t('admin.users.headers.email'), t('admin.users.headers.phone'), t('admin.users.headers.role'), t('admin.users.headers.org'), t('admin.users.headers.registered'), t('admin.users.headers.active'), t('admin.users.headers.actions')].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 font-medium text-slate-200">{user.full_name}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{user.email}</td>
                    <td className="px-6 py-3 text-slate-400 text-xs">{user.phone || '—'}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full font-medium">{user.role}</span>
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{user.organization_name || '—'}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{fmtDate(user.created_at)}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${user.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {user.is_active ? t('admin.users.active') : t('admin.users.inactive')}
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
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-slate-500">{t('admin.users.noUsers')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-200">{t('admin.audit.title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t('admin.audit.retentionNote')}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <select value={auditFilterOrg} onChange={e => setAuditFilterOrg(e.target.value)} className="z-input w-auto text-sm">
                <option value="">{t('admin.audit.allOrgs')}</option>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={auditFilterAction} onChange={e => setAuditFilterAction(e.target.value)} className="z-input w-auto text-sm">
                <option value="">{t('admin.audit.allActions')}</option>
                {Object.entries(AUDIT_ACTION_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-black/20">
                <tr>
                  {[t('admin.audit.headers.date'), t('admin.audit.headers.user'), t('admin.audit.headers.org'), t('admin.audit.headers.action'), t('admin.audit.headers.details'), t('admin.audit.headers.ip')].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {auditLoading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">{t('admin.audit.loading')}</td></tr>
                ) : auditLog.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-slate-500">{t('admin.audit.noEntries')}</td></tr>
                ) : auditLog.map(entry => (
                  <tr key={entry.id} className="hover:bg-white/[0.02]">
                    <td className="px-6 py-3 text-slate-500 text-xs whitespace-nowrap">{fmtDate(entry.created_at)}</td>
                    <td className="px-6 py-3 text-slate-300 text-xs">{entry.user_email || '—'}</td>
                    <td className="px-6 py-3 text-slate-500 text-xs">{entry.organization_name || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${AUDIT_ACTION_COLOR(entry.action)}`}>
                        {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-400 text-xs max-w-[320px] truncate" title={entry.details}>{entry.details || '—'}</td>
                    <td className="px-6 py-3 text-slate-600 text-xs font-mono">{entry.ip_address || '—'}</td>
                  </tr>
                ))}
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
  const { t } = useTranslation()
  const [form, setForm] = useState(org ? {
    ...org,
    crm_extra_config: (() => {
      try { return org.crm_extra_config ? JSON.parse(org.crm_extra_config) : null }
      catch { return null }
    })(),
    marketing_enabled: org.marketing_enabled || false,
    whatsapp_enabled: org.whatsapp_enabled || false,
    whatsapp_phone_number_id: org.whatsapp_phone_number_id || '',
    whatsapp_access_token: org.whatsapp_access_token || '',
    whatsapp_verify_token: org.whatsapp_verify_token || '',
    email_enabled: org.email_enabled || false,
    sendgrid_api_key: org.sendgrid_api_key || '',
    email_from: org.email_from || '',
    email_from_name: org.email_from_name || '',
  } : {
    name: '', plan: 'pro', retell_api_key: '', retell_phone_number: '',
    anthropic_api_key: '', is_active: true,
    crm_type: 'none', crm_webhook_url: '', crm_webhook_enabled: false,
    crm_webhook_secret: '', crm_events: '["call_ended","interested"]',
    crm_api_key: '', crm_board_or_list_id: '', crm_extra_config: null,
    marketing_enabled: false,
    whatsapp_enabled: false, whatsapp_phone_number_id: '',
    whatsapp_access_token: '', whatsapp_verify_token: '',
    email_enabled: false,
    sendgrid_api_key: '',
    email_from: '',
    email_from_name: '',
    minutes_limit: null,
  })
  const [loading, setLoading] = useState(false)
  const [crmAccordionOpen, setCrmAccordionOpen] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [testLoading, setTestLoading] = useState(false)
  const [revealLoading, setRevealLoading] = useState(false)

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
      setTestResult({ success: false, response: err.response?.data?.detail || t('settings.connectionError') })
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
      alert(err.response?.data?.detail || t('admin.errorGeneric'))
      setLoading(false)
    }
  }

  const handleReveal = async () => {
    if (!org?.id) return
    setRevealLoading(true)
    try {
      const secrets = await getOrgSecrets(org.id)
      setForm(f => ({ ...f, ...secrets }))
    } catch { alert(t('admin.orgModal.revealError')) }
    finally { setRevealLoading(false) }
  }

  const crmType = form.crm_type || 'none'
  const crmLabel = t(`admin.crmTypes.${crmType}`, { defaultValue: crmType })
  const nativeLabels = t(`admin.crmNativeLabels.${crmType}`, { returnObjects: true, defaultValue: {} })

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{org ? t('admin.orgModal.editTitle') : t('admin.orgModal.newTitle')}</h2>
          <div className="flex items-center gap-2">
            {org?.id && (
              <button
                type="button"
                onClick={handleReveal}
                disabled={revealLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 border border-amber-500/30 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <EyeIcon className="w-3.5 h-3.5" />
                {revealLoading ? t('admin.orgModal.revealing') : t('admin.orgModal.revealKeys')}
              </button>
            )}
            <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
          </div>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.name')}</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className="z-input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.plan')}</label>
            <select value={form.plan} onChange={e => set('plan', e.target.value)} className="z-input">
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.minutesLimit')}</label>
            <input
              type="number"
              min="0"
              value={form.minutes_limit ?? ''}
              onChange={e => set('minutes_limit', e.target.value ? parseInt(e.target.value) : null)}
              placeholder={t('admin.orgModal.minutesLimitPlaceholder')}
              className="z-input"
            />
            <p className="text-xs text-slate-500 mt-1">{t('admin.orgModal.minutesLimitHint')}</p>
          </div>
          <SecretInput label="Retell API Key" value={form.retell_api_key} onChange={e => set('retell_api_key', e.target.value)} />
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.retellPhone')}</label>
            <input value={form.retell_phone_number || ''} onChange={e => set('retell_phone_number', e.target.value)}
              placeholder="+12345678901" className="z-input font-mono" />
          </div>
          <SecretInput label="Anthropic API Key" value={form.anthropic_api_key} onChange={e => set('anthropic_api_key', e.target.value)} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-slate-300">{t('admin.orgModal.active')}</span>
          </label>

          {/* ── Marketing IA ────────────────────────────────────────────────── */}
          <div className="border-t border-z-border pt-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('admin.orgModal.marketingTitle')}</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.marketing_enabled} onChange={e => set('marketing_enabled', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">{t('admin.orgModal.marketingEnable')}</span>
            </label>
            <p className="text-xs text-slate-600">{t('admin.orgModal.marketingHint')}</p>
          </div>

          {/* ── WhatsApp Bot ─────────────────────────────────────────────────── */}
          <div className="border-t border-z-border pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('admin.orgModal.whatsappTitle')}</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={!!form.whatsapp_enabled} onChange={e => set('whatsapp_enabled', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">{t('admin.orgModal.whatsappEnable')}</span>
            </label>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.phoneNumberId')}</label>
              <input value={form.whatsapp_phone_number_id || ''} onChange={e => set('whatsapp_phone_number_id', e.target.value)}
                placeholder="123456789012345" className="z-input font-mono" />
              <p className="text-xs text-slate-600 mt-1">{t('admin.orgModal.phoneNumberIdHint')}</p>
            </div>
            <SecretInput label="WhatsApp Access Token" value={form.whatsapp_access_token || ''}
              onChange={e => set('whatsapp_access_token', e.target.value)}
              placeholder={t('admin.orgModal.waTokenPlaceholder')} />
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.verifyToken')}</label>
              <input value={form.whatsapp_verify_token || ''} onChange={e => set('whatsapp_verify_token', e.target.value)}
                placeholder={t('admin.orgModal.verifyTokenPlaceholder')} className="z-input font-mono" />
              <p className="text-xs text-slate-600 mt-1">{t('admin.orgModal.verifyTokenHint')}</p>
            </div>
          </div>

          {/* ── Email Marketing ─────────────────────────────────────────────── */}
          <div className="border-t border-z-border pt-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('admin.orgModal.emailTitle')}</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={!!form.email_enabled}
                onChange={e => set('email_enabled', e.target.checked)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-sm text-slate-300">{t('admin.orgModal.emailEnable')}</span>
            </label>
            <SecretInput
              label="SendGrid API Key"
              value={form.sendgrid_api_key || ''}
              onChange={e => set('sendgrid_api_key', e.target.value)}
              placeholder={t('admin.orgModal.sendgridPlaceholder')}
            />
            <p className="text-xs text-slate-500 -mt-1">
              {t('admin.orgModal.sendgridHint')}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.senderEmail')}</label>
              <input
                value={form.email_from || ''}
                onChange={e => set('email_from', e.target.value)}
                placeholder="info@empresa.com"
                type="email"
                className="z-input"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.senderName')}</label>
              <input
                value={form.email_from_name || ''}
                onChange={e => set('email_from_name', e.target.value)}
                placeholder={t('admin.orgModal.senderNamePlaceholder')}
                className="z-input"
              />
            </div>
          </div>

          {/* ── CRM Integration ─────────────────────────────────────────────── */}
          <div className="border-t border-z-border pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {t('admin.orgModal.crmTitle')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.crmPlatform')}</label>
              <select
                value={crmType}
                onChange={e => { set('crm_type', e.target.value); setTestResult(null) }}
                className="z-input"
              >
                {CRM_TYPE_VALUES.map(c => <option key={c} value={c}>{t(`admin.crmTypes.${c}`)}</option>)}
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
                  <span className="text-sm text-slate-300">{t('admin.orgModal.crmEnable')}</span>
                </label>

                {NATIVE_CRM_TYPES.includes(crmType) ? (
                  /* ── Native CRM fields ──────────────────────────────────── */
                  <>
                    <SecretInput
                      label={nativeLabels.apiKey || 'API Key'}
                      value={form.crm_api_key}
                      onChange={e => set('crm_api_key', e.target.value)}
                    />

                    {nativeLabels.boardId && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">
                          {nativeLabels.boardId}
                        </label>
                        <input
                          type="text"
                          value={form.crm_board_or_list_id || ''}
                          onChange={e => set('crm_board_or_list_id', e.target.value)}
                          placeholder={nativeLabels.boardIdPlaceholder || ''}
                          className="z-input font-mono"
                        />
                      </div>
                    )}

                    {crmType === 'salesforce' && (
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">{nativeLabels.instanceUrl}</label>
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
                      <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.orgModal.webhookUrl')}</label>
                      <input
                        value={form.crm_webhook_url || ''}
                        onChange={e => { set('crm_webhook_url', e.target.value); setTestResult(null) }}
                        placeholder={CRM_PLACEHOLDERS[crmType] || 'https://...'}
                        className="z-input font-mono text-xs"
                      />
                    </div>

                    <SecretInput
                      label={t('admin.orgModal.webhookSecret')}
                      value={form.crm_webhook_secret}
                      onChange={e => set('crm_webhook_secret', e.target.value)}
                      placeholder={t('admin.orgModal.webhookSecretPlaceholder')}
                      hint={<>{t('admin.orgModal.webhookSecretHint')}<code className="text-slate-500">X-ZyraVoice-Signature</code></>}
                    />

                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">{t('admin.orgModal.sendWhen')}</label>
                      <div className="space-y-1.5">
                        {CRM_EVENTS_VALUES.map(ev => (
                          <label key={ev.value} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={ev.always || getCrmEvents().includes(ev.value)}
                              disabled={ev.always}
                              onChange={() => !ev.always && toggleCrmEvent(ev.value)}
                              className="w-4 h-4 accent-blue-500 disabled:opacity-60"
                            />
                            <span className="text-sm text-slate-300">{t(`admin.crmEvents.${ev.value}`)}</span>
                            {ev.always && <span className="text-xs text-slate-600">{t('admin.orgModal.always')}</span>}
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
                          {testLoading ? t('admin.orgModal.testing') : t('admin.orgModal.testConnection')}
                        </button>
                        {testResult && (
                          <div className={`text-xs rounded-lg px-3 py-2 ${
                            testResult.success
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                              : 'bg-red-500/10 text-red-400 border border-red-500/20'
                          }`}>
                            {testResult.success
                              ? t('admin.orgModal.testSuccess', { code: testResult.status_code })
                              : t('admin.orgModal.testError', { code: testResult.status_code || '', msg: testResult.response })
                            }
                          </div>
                        )}
                      </div>
                    )}

                    {/* Instructions accordion */}
                    {t(`admin.crmInstructions.${crmType}`, { defaultValue: '' }) && (
                      <div className="border border-z-border rounded-lg overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setCrmAccordionOpen(o => !o)}
                          className="w-full flex items-center justify-between px-4 py-3 text-sm text-slate-400 hover:text-slate-200 hover:bg-white/[0.02] transition-colors"
                        >
                          <span>{t('admin.orgModal.instructionsFor', { crm: crmLabel })}</span>
                          <span className="text-slate-600 text-xs">{crmAccordionOpen ? '▲' : '▼'}</span>
                        </button>
                        {crmAccordionOpen && (
                          <div className="px-4 pb-4 border-t border-z-border pt-3">
                            <pre className="text-xs text-slate-400 whitespace-pre-wrap font-sans leading-relaxed">
                              {t(`admin.crmInstructions.${crmType}`)}
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
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('admin.orgModal.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary disabled:opacity-50">
              {loading ? t('admin.orgModal.saving') : t('admin.orgModal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function UserModal({ user, orgs, onClose, onSaved }) {
  const { t } = useTranslation()
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
      alert(err.response?.data?.detail || t('admin.errorGeneric'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{user ? t('admin.userModal.editTitle') : t('admin.userModal.newTitle')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.userModal.fullName')}</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required className="z-input" />
          </div>
          {!user && <>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.userModal.email')}</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className="z-input" />
            </div>
            <SecretInput
              label={t('admin.userModal.password')}
              value={form.password}
              onChange={e => set('password', e.target.value)}
              placeholder={t('admin.userModal.passwordPlaceholder')}
              required
            />
          </>}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.userModal.role')}</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className="z-input">
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('admin.userModal.org')}</label>
            <select value={form.organization_id || ''} onChange={e => set('organization_id', e.target.value ? Number(e.target.value) : null)} className="z-input">
              <option value="">{t('admin.userModal.noOrg')}</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          {user && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active !== false} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">{t('admin.userModal.active')}</span>
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('admin.userModal.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary disabled:opacity-50">
              {loading ? t('admin.userModal.saving') : t('admin.userModal.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
