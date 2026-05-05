import { useState, useEffect, useRef } from 'react'
import {
  CheckCircleIcon, EnvelopeIcon, PaperClipIcon, ChevronDownIcon,
  PencilSquareIcon, SparklesIcon, PlusIcon, TrashIcon, EyeIcon,
  ClockIcon, UserMinusIcon, ListBulletIcon, Cog6ToothIcon, PaperAirplaneIcon,
} from '@heroicons/react/24/outline'
import {
  getEmailSettings, saveEmailSettings, uploadEmailAttachment,
  sendTestEmail, bulkSendEmail, getBulkSendStatus, getCampaigns,
  getEmailHistory, validateEmailRecipients, uploadTemplateAttachment,
  getEmailContactsCount, importEmailContacts, getEmailRecipientsDetail,
  getEmailLists, createEmailList, deleteEmailList,
  getEmailListContacts, deleteEmailListContact, addEmailListContact, importEmailContactsToList,
  getScheduledEmails, cancelScheduledEmail,
} from '../api/client'

const FIXED_TEMPLATES = [
  { key: 'general',            label: 'General',       desc: 'Primer contacto o seguimiento' },
  { key: 'interested',         label: 'Interesado',    desc: 'Prospecto mostró interés en la llamada' },
  { key: 'callback_requested', label: 'Callback',      desc: 'Acordaron llamar de nuevo' },
  { key: 'voicemail',          label: 'Buzón de voz',  desc: 'No se pudo hablar, se dejó buzón' },
  { key: 'not_interested',     label: 'No interesado', desc: 'Prospecto declinó en la llamada' },
]

const PRO_GALLERY = [
  { key: 'general',            label: 'Primer contacto',    tag: 'General',       tagColor: 'bg-slate-500/20 text-slate-400' },
  { key: 'interested',         label: 'Prospecto caliente', tag: 'Interesado',    tagColor: 'bg-green-500/20 text-green-400' },
  { key: 'callback_requested', label: 'Recordatorio amable',tag: 'Callback',      tagColor: 'bg-blue-500/20 text-blue-400' },
  { key: 'voicemail',          label: 'Buzón sin respuesta',tag: 'Buzón de voz',  tagColor: 'bg-amber-500/20 text-amber-400' },
  { key: 'not_interested',     label: 'Cierre cordial',     tag: 'No interesado', tagColor: 'bg-red-500/20 text-red-400' },
]
const FIXED_KEYS = new Set(FIXED_TEMPLATES.map(t => t.key))
const EMPTY_TMPL = { subject: '', greeting: '', body: '', cta_text: '', cta_url: '', signature: '' }

const PRO_TEMPLATES = {
  general: {
    subject: 'Información sobre nuestros servicios — {{empresa}}',
    greeting: 'Estimado/a {{nombre}},',
    body: 'Me pongo en contacto para presentarle cómo podemos ayudar a {{empresa}} a mejorar sus resultados.\n\nNuestro equipo ha trabajado con empresas de su sector obteniendo resultados concretos y medibles. Me encantaría agendar una breve llamada de 15 minutos para contarle los detalles.\n\n¿Tendría disponibilidad esta semana?',
    cta_text: 'Agendar llamada', cta_url: '', signature: 'Atentamente,\n{{agente}}',
  },
  interested: {
    subject: 'Próximos pasos — {{empresa}}',
    greeting: 'Estimado/a {{nombre}},',
    body: 'Fue un placer hablar con usted hoy. Me alegra mucho su interés.\n\nTal como conversamos, estos son los próximos pasos:\n\n1. Le preparamos una propuesta personalizada para {{empresa}}\n2. La revisamos juntos en una videollamada\n3. Definimos el plan de trabajo\n\nEsperamos su confirmación para comenzar cuanto antes.',
    cta_text: 'Confirmar reunión', cta_url: '', signature: 'Con gusto le atiendo,\n{{agente}}',
  },
  callback_requested: {
    subject: 'Le contactaremos pronto — {{empresa}}',
    greeting: 'Estimado/a {{nombre}},',
    body: 'Gracias por tomarse el tiempo de hablar con nosotros hoy.\n\nTal como acordamos, uno de nuestros asesores le contactará en breve para continuar la conversación y resolver todas sus dudas sin compromiso.\n\nSi prefiere comunicarse antes o cambiar el horario, no dude en responder a este correo.',
    cta_text: '', cta_url: '', signature: 'Hasta pronto,\n{{agente}}',
  },
  voicemail: {
    subject: 'Intentamos contactarle — {{empresa}}',
    greeting: 'Estimado/a {{nombre}},',
    body: 'Intentamos comunicarnos con usted hoy y lamentamos no haberle podido hablar directamente.\n\nTenemos una propuesta que podría ser de gran valor para {{empresa}} y nos gustaría presentársela personalmente.\n\nPor favor, indíquenos el mejor momento para llamarle respondiendo a este correo, o agéndese directamente en el enlace de abajo.',
    cta_text: 'Elegir horario', cta_url: '', signature: 'Quedamos a su disposición,\n{{agente}}',
  },
  not_interested: {
    subject: 'Gracias por su tiempo — {{empresa}}',
    greeting: 'Estimado/a {{nombre}},',
    body: 'Gracias por dedicarnos su tiempo hoy.\n\nEntendemos perfectamente que en este momento no es la prioridad. Las circunstancias cambian, y cuando llegue el momento adecuado, estaremos aquí para ayudarle.\n\nSi en el futuro necesita apoyo en esta área, no dude en contactarnos.',
    cta_text: '', cta_url: '', signature: 'Muchas gracias,\n{{agente}}',
  },
}

function formatBody(text) {
  if (!text) return '<span style="color:#9ca3af;font-style:italic">Cuerpo del mensaje...</span>'
  const parts = []
  for (const para of text.trim().split(/\n{2,}/)) {
    const lines = para.split('\n').filter(l => l.trim())
    if (!lines.length) continue
    if (lines.every(l => l.trim().startsWith('- '))) {
      const items = lines.map(l => `<li style="margin:3px 0;color:#374151;font-size:14px">${l.trim().slice(2)}</li>`).join('')
      parts.push(`<ul style="margin:4px 0 14px;padding-left:20px">${items}</ul>`)
    } else {
      parts.push(`<p style="margin:0 0 14px;line-height:1.75;color:#374151;font-size:14px">${lines.join('<br>')}</p>`)
    }
  }
  return parts.join('')
}

function formatSignature(text) {
  if (!text) return '<span style="font-style:italic;color:#9ca3af">Firma...</span>'
  return text.split('\n').join('<br>')
}

function buildHtml(t) {
  const ctaLabel = t.cta_text || (t.cta_url ? 'Ver más →' : '')
  const cta = ctaLabel && t.cta_url
    ? `<p style="text-align:center;margin:20px 0"><a href="${t.cta_url}" style="background:#1e40af;color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px">${ctaLabel}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;color:#111827">
  <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb">
    <p style="margin:0 0 16px;color:#111827;font-size:14px">${t.greeting || '<span style="color:#9ca3af;font-style:italic">Saludo...</span>'}</p>
    <div style="line-height:1.75">${formatBody(t.body)}</div>
    ${cta}
  </div>
  <div style="padding:16px 32px;background:#f9fafb">
    <p style="color:#6b7280;font-size:12px;margin:0">${formatSignature(t.signature)}</p>
  </div>
</div>`
}

// Accordion header component
function Section({ id, label, icon: Icon, badge, openSections, toggle, children }) {
  const isOpen = openSections.has(id)
  return (
    <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-4 h-4 text-slate-400 flex-shrink-0" />}
          <span className="text-sm font-semibold text-slate-200">{label}</span>
          {badge != null && (
            <span className="px-2 py-0.5 text-xs bg-blue-500/15 text-blue-400 rounded-full">{badge}</span>
          )}
        </div>
        <ChevronDownIcon className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="border-t border-z-border">{children}</div>}
    </div>
  )
}

export default function EmailMarketing() {
  const [cfg, setCfg] = useState({
    email_enabled: false, email_from: '', email_from_name: '',
    sendgrid_configured: false,
    email_send_on_interested: false, email_send_on_callback: false,
    email_send_on_voicemail: false, email_send_on_not_interested: false,
    email_templates: {}, email_attachment_name: null,
    email_send_delay_ms: 0,
  })
  const [campaigns, setCampaigns] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Accordion
  const [openSections, setOpenSections] = useState(new Set(['listas', 'envio']))
  const toggle = (id) => setOpenSections(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Email lists
  const [emailLists, setEmailLists] = useState([])
  const [newListName, setNewListName] = useState('')
  const [showNewListInput, setShowNewListInput] = useState(false)
  const [creatingList, setCreatingList] = useState(false)
  const [listContacts, setListContacts] = useState({ id: null, contacts: [], loading: false })
  const [addContactForm, setAddContactForm] = useState({ listId: null, name: '', email: '', company: '', saving: false, error: '' })
  const listImportRefs = useRef({})

  // Bulk send
  const [bulkCampaign, setBulkCampaign] = useState('')  // '' | campaign_id | 'email_only' | 'list:id'
  const [bulkTmpl, setBulkTmpl] = useState('general')
  const [bulkBatchSize, setBulkBatchSize] = useState('')  // '' = unlimited
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkResult, setBulkResult] = useState(null)
  const [confirmStep, setConfirmStep] = useState(false)
  const [errorsOpen, setErrorsOpen] = useState(false)
  const [recipientStats, setRecipientStats] = useState(null)
  const [recipientLoading, setRecipientLoading] = useState(false)
  const [recipientDetail, setRecipientDetail] = useState(null)
  const [recipientDetailLoading, setRecipientDetailLoading] = useState(false)
  const [recipientDetailOpen, setRecipientDetailOpen] = useState(false)
  const [recipientDetailTab, setRecipientDetailTab] = useState('will_receive')
  const [bulkJobId, setBulkJobId] = useState(null)
  const [bulkJobProgress, setBulkJobProgress] = useState(null) // live job status
  const bulkPollRef = useRef(null)

  // Test send
  const [testAddr, setTestAddr] = useState('')
  const [testTmpl, setTestTmpl] = useState('general')
  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState(null)

  // History error detail modal
  const [errorDetailLog, setErrorDetailLog] = useState(null) // {template_subject, error_details:[]}

  // Template editor
  const [editingTmpl, setEditingTmpl] = useState(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [newTmplName, setNewTmplName] = useState('')
  const [showNewInput, setShowNewInput] = useState(false)
  const [previewProKey, setPreviewProKey] = useState(null)

  // Attachments
  const [attachLoading, setAttachLoading] = useState(false)
  const [attachMsg, setAttachMsg] = useState(null)
  const [tmplAttachLoading, setTmplAttachLoading] = useState(false)
  const [tmplAttachMsg, setTmplAttachMsg] = useState(null)

  // History
  const [emailHistory, setEmailHistory] = useState([])

  // Legacy email-only contacts (global, no list)
  const [emailContactsCount, setEmailContactsCount] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const [scheduledJobs, setScheduledJobs] = useState([])
  const [scheduleMode, setScheduleMode] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const fileRef = useRef(null)
  const tmplAttachRef = useRef(null)
  const emailImportRef = useRef(null)
  const editorRef = useRef(null)

  const loadHistory = () => getEmailHistory().then(setEmailHistory).catch(() => {})
  const loadScheduled = () => getScheduledEmails().then(setScheduledJobs).catch(() => {})
  const loadEmailContactsCount = () => getEmailContactsCount().then(setEmailContactsCount).catch(() => {})
  const loadEmailLists = () => getEmailLists().then(setEmailLists).catch(() => {})

  useEffect(() => {
    getEmailSettings().then(d => setCfg({
      email_enabled: d.email_enabled ?? false,
      email_from: d.email_from || '', email_from_name: d.email_from_name || '',
      sendgrid_configured: d.sendgrid_configured ?? false,
      email_send_on_interested: d.email_send_on_interested ?? false,
      email_send_on_callback: d.email_send_on_callback ?? false,
      email_send_on_voicemail: d.email_send_on_voicemail ?? false,
      email_send_on_not_interested: d.email_send_on_not_interested ?? false,
      email_templates: d.email_templates || {}, email_attachment_name: d.email_attachment_name || null,
      email_send_delay_ms: d.email_send_delay_ms ?? 0,
    })).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
    loadHistory()
    loadEmailContactsCount()
    loadEmailLists()
    loadScheduled()
  }, [])

  // Template helpers
  const customTemplates = Object.keys(cfg.email_templates)
    .filter(k => !FIXED_KEYS.has(k))
    .map(k => ({ key: k, label: cfg.email_templates[k]._label || k, isCustom: true, desc: 'Plantilla personalizada' }))
  const allTemplates = [...FIXED_TEMPLATES.map(t => ({ ...t, isCustom: false })), ...customTemplates]

  const getTmpl = k => { const { _label, ...rest } = cfg.email_templates[k] || { ...EMPTY_TMPL }; return rest }
  const setTmplField = (k, f, v) =>
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [k]: { ...(p.email_templates[k] || {}), [f]: v } } }))

  const openEditor = (key) => {
    setEditingTmpl(editingTmpl === key ? null : key)
    setPreviewOpen(false)
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  const createTemplate = () => {
    const name = newTmplName.trim(); if (!name) return
    const key = `tmpl_${Date.now()}`
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [key]: { _label: name, ...EMPTY_TMPL } } }))
    setNewTmplName(''); setShowNewInput(false); setEditingTmpl(key); setPreviewOpen(false)
    setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  const deleteTemplate = (key) => {
    if (!confirm('¿Eliminar esta plantilla?')) return
    setCfg(p => { const t = { ...p.email_templates }; delete t[key]; return { ...p, email_templates: t } })
    if (editingTmpl === key) setEditingTmpl(null)
  }

  const renameTemplate = (key, newName) =>
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [key]: { ...p.email_templates[key], _label: newName } } }))

  const loadProTemplate = (key) => {
    const pro = PRO_TEMPLATES[key] || PRO_TEMPLATES.general
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [key]: { ...(p.email_templates[key] || {}), ...pro } } }))
  }

  const isFilled = (key) => { const t = cfg.email_templates[key]; return t && (t.subject || t.body) }

  const save = async () => {
    setSaving(true); setSaved(false)
    try {
      await saveEmailSettings({
        email_enabled: cfg.email_enabled, email_from: cfg.email_from || null,
        email_from_name: cfg.email_from_name || null,
        email_send_on_interested: cfg.email_send_on_interested,
        email_send_on_callback: cfg.email_send_on_callback,
        email_send_on_voicemail: cfg.email_send_on_voicemail,
        email_send_on_not_interested: cfg.email_send_on_not_interested,
        email_templates: cfg.email_templates,
        email_send_delay_ms: cfg.email_send_delay_ms ?? 0,
      })
      setSaved(true); setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert(e.response?.data?.detail || 'Error') }
    finally { setSaving(false) }
  }

  // Email lists CRUD
  const handleCreateList = async () => {
    const name = newListName.trim(); if (!name) return
    setCreatingList(true)
    try {
      const created = await createEmailList({ name })
      setEmailLists(prev => [...prev, created])
      setNewListName(''); setShowNewListInput(false)
    } catch (e) { alert(e.response?.data?.detail || 'Error al crear lista') }
    finally { setCreatingList(false) }
  }

  const handleDeleteList = async (id) => {
    const list = emailLists.find(l => l.id === id)
    if (!confirm(`¿Eliminar la lista "${list?.name}" y todos sus ${list?.total} contactos?`)) return
    try {
      await deleteEmailList(id)
      setEmailLists(prev => prev.filter(l => l.id !== id))
      if (listContacts.id === id) setListContacts({ id: null, contacts: [], loading: false })
    } catch (e) { alert(e.response?.data?.detail || 'Error al eliminar lista') }
  }

  const handleViewContacts = async (listId) => {
    if (listContacts.id === listId) {
      setListContacts({ id: null, contacts: [], loading: false })
      return
    }
    setListContacts({ id: listId, contacts: [], loading: true })
    try {
      const contacts = await getEmailListContacts(listId)
      setListContacts({ id: listId, contacts, loading: false })
    } catch (e) { setListContacts({ id: null, contacts: [], loading: false }) }
  }

  const handleDeleteContact = async (listId, contactId) => {
    try {
      await deleteEmailListContact(listId, contactId)
      setListContacts(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== contactId) }))
      setEmailLists(prev => prev.map(l =>
        l.id === listId ? { ...l, total: l.total - 1, with_email: l.with_email - 1 } : l
      ))
    } catch (e) { alert('Error al eliminar contacto') }
  }

  const handleAddContact = async () => {
    const { listId, name, email, company } = addContactForm
    if (!email.trim()) return
    setAddContactForm(p => ({ ...p, saving: true, error: '' }))
    try {
      const created = await addEmailListContact(listId, { name: name.trim(), email: email.trim(), company: company.trim() || null })
      setListContacts(prev =>
        prev.id === listId
          ? { ...prev, contacts: [created, ...prev.contacts] }
          : prev
      )
      setEmailLists(prev => prev.map(l =>
        l.id === listId ? { ...l, total: l.total + 1, with_email: l.with_email + 1 } : l
      ))
      setAddContactForm({ listId: null, name: '', email: '', company: '', saving: false, error: '' })
    } catch (e) {
      setAddContactForm(p => ({ ...p, saving: false, error: e.response?.data?.detail || 'Error al agregar' }))
    }
  }

  const handleImportToList = async (listId, file) => {
    if (!file) return
    try {
      const r = await importEmailContactsToList(listId, file)
      const msg = `${r.imported} importados${r.skipped ? `, ${r.skipped} omitidos` : ''}${r.errors?.length ? `\n${r.errors.join('\n')}` : ''}`
      alert(msg)
      loadEmailLists()
      if (listContacts.id === listId) handleViewContacts(listId)
    } catch (e) { alert(e.response?.data?.detail || 'Error al importar') }
  }

  // Bulk send helpers
  const parseBulkTarget = () => {
    const base = bulkCampaign.startsWith('list:') ? { email_list_id: Number(bulkCampaign.slice(5)) }
      : bulkCampaign === 'email_only' ? { email_only: true }
      : bulkCampaign ? { campaign_id: Number(bulkCampaign) }
      : {}
    if (bulkBatchSize) base.batch_size = Number(bulkBatchSize)
    return base
  }

  const sendBulk = async () => {
    setBulkLoading(true); setBulkResult(null); setConfirmStep(false)
    setErrorsOpen(false)
    if (bulkPollRef?.current) { clearInterval(bulkPollRef.current); bulkPollRef.current = null }
    try {
      const target = parseBulkTarget()
      const payload = {
        ...target,
        template_key: bulkTmpl,
        ...(scheduleMode && scheduleAt ? { scheduled_at: new Date(scheduleAt).toISOString() } : {}),
      }
      const r = await bulkSendEmail(payload)
      if (r.scheduled) {
        setBulkResult(r)
        setScheduleMode(false); setScheduleAt('')
        loadScheduled()
        setBulkLoading(false)
      } else if (r.job_id) {
        setBulkJobId(r.job_id)
        loadHistory()
        setBulkLoading(false)
      } else {
        setBulkResult(r)
        setScheduleMode(false); setScheduleAt('')
        loadHistory()
        setBulkLoading(false)
      }
    } catch (e) {
      setBulkResult({ error: e.response?.data?.detail || 'Error al iniciar el envío' })
      setBulkLoading(false)
    }
  }

  const prepareSend = async () => {
    setConfirmStep(true); setBulkResult(null); setRecipientStats(null)
    setRecipientDetail(null); setRecipientDetailOpen(false); setRecipientLoading(true)
    try {
      const stats = await validateEmailRecipients(parseBulkTarget())
      setRecipientStats(stats)
    } catch (e) { /* non-critical */ }
    finally { setRecipientLoading(false) }
  }

  const loadRecipientDetail = async () => {
    if (recipientDetail) { setRecipientDetailOpen(true); return }
    setRecipientDetailLoading(true)
    try {
      const detail = await getEmailRecipientsDetail(parseBulkTarget())
      setRecipientDetail(detail); setRecipientDetailOpen(true); setRecipientDetailTab('will_receive')
    } catch (e) { /* non-critical */ }
    finally { setRecipientDetailLoading(false) }
  }

  // Legacy import (no list)
  const handleImportContacts = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    setImportLoading(true); setImportResult(null)
    try {
      const r = await importEmailContacts(f)
      setImportResult(r); loadEmailContactsCount()
    } catch (err) { setImportResult({ error: err.response?.data?.detail || 'Error al importar' }) }
    finally { setImportLoading(false); e.target.value = '' }
  }

  const uploadTmplAttach = async (e) => {
    const f = e.target.files?.[0]; if (!f || !editingTmpl) return
    if (f.size > 5 * 1024 * 1024) { setTmplAttachMsg({ ok: false, text: 'Máximo 5 MB' }); return }
    setTmplAttachLoading(true); setTmplAttachMsg(null)
    try {
      const r = await uploadTemplateAttachment(editingTmpl, f)
      setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [editingTmpl]: { ...(p.email_templates[editingTmpl] || {}), attachment_name: r.filename } } }))
      setTmplAttachMsg({ ok: true, text: r.filename })
    } catch (e) { setTmplAttachMsg({ ok: false, text: 'Error al subir' }) }
    finally { setTmplAttachLoading(false) }
  }

  const sendTest = async () => {
    if (!testAddr) return
    setTestLoading(true); setTestMsg(null)
    try {
      await sendTestEmail({ to_email: testAddr, outcome: testTmpl, template: cfg.email_templates[testTmpl] || {}, from_email_override: cfg.email_from || null, from_name_override: cfg.email_from_name || null })
      setTestMsg({ ok: true, text: 'Prueba enviada correctamente' })
    } catch (e) { setTestMsg({ ok: false, text: e.response?.data?.detail || 'Error' }) }
    finally { setTestLoading(false) }
  }

  const uploadAttach = async (e) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 5 * 1024 * 1024) { setAttachMsg({ ok: false, text: 'Máximo 5 MB' }); return }
    setAttachLoading(true); setAttachMsg(null)
    try {
      const r = await uploadEmailAttachment(f)
      setCfg(p => ({ ...p, email_attachment_name: r.filename }))
      setAttachMsg({ ok: true, text: r.filename })
    } catch (e) { setAttachMsg({ ok: false, text: 'Error al subir' }) }
    finally { setAttachLoading(false) }
  }

  const editingData = editingTmpl ? getTmpl(editingTmpl) : null
  const editingMeta = editingTmpl ? allTemplates.find(t => t.key === editingTmpl) : null

  const totalListContacts = emailLists.reduce((s, l) => s + l.with_email, 0)

  return (
    <div className="p-6 space-y-3 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <EnvelopeIcon className="w-6 h-6 text-z-blue-light" /> Email Marketing
        </h1>
        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${cfg.sendgrid_configured ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {cfg.sendgrid_configured ? '✓ Activo' : '⚠ Sin configurar'}
        </span>
      </div>

      {/* ── 1. LISTAS DE EMAIL ── */}
      <Section id="listas" label="Listas de email" icon={ListBulletIcon}
        badge={emailLists.length > 0 ? `${emailLists.length} lista${emailLists.length !== 1 ? 's' : ''} · ${totalListContacts} contactos` : undefined}
        openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            Organiza tus contactos de email en listas independientes. Cada lista puede tener sus propios contactos importados desde CSV.
          </p>

          {/* New list button / input */}
          {showNewListInput ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text" value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') { setShowNewListInput(false); setNewListName('') } }}
                placeholder="Nombre de la lista..."
                className="z-input-light text-sm flex-1" />
              <button onClick={handleCreateList} disabled={!newListName.trim() || creatingList}
                className="z-btn-primary text-xs disabled:opacity-50 whitespace-nowrap">
                {creatingList ? 'Creando...' : 'Crear'}
              </button>
              <button onClick={() => { setShowNewListInput(false); setNewListName('') }}
                className="z-btn-ghost text-xs">Cancelar</button>
            </div>
          ) : (
            <button onClick={() => setShowNewListInput(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors">
              <PlusIcon className="w-3.5 h-3.5" /> Nueva lista
            </button>
          )}

          {/* Lists */}
          {emailLists.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-4">No hay listas creadas aún.</p>
          ) : (
            <div className="space-y-2">
              {emailLists.map(list => (
                <div key={list.id} className="rounded-xl border border-z-border overflow-hidden">
                  {/* List header row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white/3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ListBulletIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{list.name}</p>
                        <p className="text-xs text-slate-500">
                          {list.total} total · <span className="text-green-400">{list.with_email} con email válido</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Import CSV to this list */}
                      <input
                        ref={el => { if (el) listImportRefs.current[list.id] = el }}
                        type="file" accept=".csv,.xlsx,.xls" className="hidden"
                        onChange={async e => {
                          const f = e.target.files?.[0]
                          if (f) await handleImportToList(list.id, f)
                          e.target.value = ''
                        }}
                      />
                      <button
                        onClick={() => listImportRefs.current[list.id]?.click()}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors">
                        <PlusIcon className="w-3 h-3" /> CSV
                      </button>
                      <button
                        onClick={() => setAddContactForm(p => p.listId === list.id
                          ? { listId: null, name: '', email: '', company: '', saving: false, error: '' }
                          : { listId: list.id, name: '', email: '', company: '', saving: false, error: '' }
                        )}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${addContactForm.listId === list.id ? 'text-slate-200 border-slate-400/40 bg-white/10' : 'text-blue-400 border-blue-400/30 hover:bg-blue-400/10'}`}>
                        <PlusIcon className="w-3 h-3" /> Manual
                      </button>
                      <button
                        onClick={() => handleViewContacts(list.id)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${listContacts.id === list.id ? 'text-slate-200 border-slate-400/40 bg-white/10' : 'text-slate-400 border-z-border hover:bg-white/5'}`}>
                        <EyeIcon className="w-3 h-3" />
                        {listContacts.id === list.id ? 'Ocultar' : 'Ver'}
                      </button>
                      <button
                        onClick={() => handleDeleteList(list.id)}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline add-contact form */}
                  {addContactForm.listId === list.id && (
                    <div className="border-t border-z-border bg-white/3 px-4 py-3 space-y-2">
                      <p className="text-xs font-medium text-slate-400">Agregar contacto manualmente</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text" placeholder="Nombre" value={addContactForm.name}
                          onChange={e => setAddContactForm(p => ({ ...p, name: e.target.value }))}
                          className="z-input-light text-xs" />
                        <input
                          type="email" placeholder="Email *" value={addContactForm.email}
                          onChange={e => setAddContactForm(p => ({ ...p, email: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddContact()}
                          className="z-input-light text-xs" />
                        <input
                          type="text" placeholder="Empresa" value={addContactForm.company}
                          onChange={e => setAddContactForm(p => ({ ...p, company: e.target.value }))}
                          className="z-input-light text-xs" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleAddContact} disabled={!addContactForm.email.trim() || addContactForm.saving}
                          className="z-btn-primary text-xs disabled:opacity-50">
                          {addContactForm.saving ? 'Guardando...' : 'Agregar'}
                        </button>
                        <button onClick={() => setAddContactForm({ listId: null, name: '', email: '', company: '', saving: false, error: '' })}
                          className="z-btn-ghost text-xs">Cancelar</button>
                        {addContactForm.error && <p className="text-xs text-red-400">{addContactForm.error}</p>}
                      </div>
                    </div>
                  )}

                  {/* Contacts panel */}
                  {listContacts.id === list.id && (
                    <div className="border-t border-z-border">
                      {listContacts.loading ? (
                        <p className="text-center text-slate-500 text-sm py-6 animate-pulse">Cargando contactos...</p>
                      ) : listContacts.contacts.length === 0 ? (
                        <p className="text-center text-slate-600 text-sm py-6">Sin contactos. Importa un CSV para comenzar.</p>
                      ) : (
                        <div className="overflow-x-auto max-h-72 overflow-y-auto">
                          <table className="w-full text-xs min-w-[480px]">
                            <thead className="bg-black/20 sticky top-0">
                              <tr>
                                {['Nombre', 'Email', 'Empresa', ''].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 uppercase">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-z-border">
                              {listContacts.contacts.map(c => (
                                <tr key={c.id} className="hover:bg-white/[0.02]">
                                  <td className="px-3 py-2 text-slate-200 font-medium max-w-[120px] truncate">{c.name || '—'}</td>
                                  <td className="px-3 py-2 font-mono text-slate-300 max-w-[180px] truncate">
                                    {c.unsubscribed
                                      ? <span className="text-red-400">{c.email} <span className="text-xs">(desuscrito)</span></span>
                                      : c.email || <span className="text-slate-600 italic">sin email</span>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate">{c.company || '—'}</td>
                                  <td className="px-3 py-2 text-right">
                                    <button onClick={() => handleDeleteContact(list.id, c.id)}
                                      className="text-slate-600 hover:text-red-400 transition-colors p-0.5">
                                      <TrashIcon className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* ── 2. ENVÍO MASIVO ── */}
      <Section id="envio" label="Envío masivo" icon={PaperAirplaneIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">Selecciona el segmento y la plantilla, revisa el resumen y confirma el envío.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Destinatarios</label>
              <select value={bulkCampaign} onChange={e => { setBulkCampaign(e.target.value); setConfirmStep(false); setBulkResult(null) }}
                className="z-input-light text-sm">
                <option value="">Todos (campañas + listas)</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="email_only">
                  Contactos de email {emailContactsCount ? `(${emailContactsCount.with_email})` : ''}
                </option>
                {emailLists.length > 0 && (
                  <optgroup label="── Listas de email ──">
                    {emailLists.map(l => (
                      <option key={`list:${l.id}`} value={`list:${l.id}`}>
                        {l.name} ({l.with_email} contactos)
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Plantilla</label>
              <select value={bulkTmpl} onChange={e => { setBulkTmpl(e.target.value); setConfirmStep(false); setBulkResult(null) }}
                className="z-input-light text-sm">
                {allTemplates.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>

          {/* Batch size */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-z-border">
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-300">Envío por tandas</p>
              <p className="text-xs text-slate-500 mt-0.5">Limita cuántos emails se envían por ejecución para evitar filtros de spam. Los no contactados van siempre primero.</p>
            </div>
            <select value={bulkBatchSize} onChange={e => { setBulkBatchSize(e.target.value); setConfirmStep(false); setBulkResult(null) }}
              className="z-input-light text-sm w-36 flex-shrink-0">
              <option value="">Sin límite</option>
              <option value="50">50 por tanda</option>
              <option value="100">100 por tanda</option>
              <option value="200">200 por tanda</option>
              <option value="500">500 por tanda</option>
              <option value="1000">1000 por tanda</option>
            </select>
          </div>

          {(() => {
            const subj = cfg.email_templates[bulkTmpl]?.subject
            return subj
              ? <p className="text-xs text-slate-400">Asunto: <span className="text-slate-300 italic">"{subj}"</span></p>
              : <p className="text-xs text-amber-400">⚠ La plantilla seleccionada no tiene asunto configurado</p>
          })()}

          {!cfg.sendgrid_configured && (
            <p className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
              ⚠ El administrador debe configurar SendGrid antes de poder enviar emails.
            </p>
          )}

          {!confirmStep && !bulkResult && (
            <button onClick={prepareSend} disabled={!cfg.sendgrid_configured} className="z-btn-primary w-full disabled:opacity-40">
              Preparar envío
            </button>
          )}

          {confirmStep && !bulkLoading && (
            <div className="rounded-xl border border-z-border bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-z-border">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Resumen del envío</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Destinatarios</span>
                  <span className="text-slate-200 font-medium">
                    {bulkCampaign.startsWith('list:')
                      ? emailLists.find(l => l.id === Number(bulkCampaign.slice(5)))?.name || 'Lista'
                      : bulkCampaign === 'email_only'
                        ? `Contactos de email (${emailContactsCount?.with_email ?? '…'})`
                        : bulkCampaign
                          ? campaigns.find(c => String(c.id) === bulkCampaign)?.name || 'Campaña'
                          : 'Todos (campañas + listas, sin duplicados)'}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Plantilla</span>
                  <span className="text-slate-200 font-medium">{allTemplates.find(t => t.key === bulkTmpl)?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Remitente</span>
                  <span className="text-slate-200">{cfg.email_from_name || '—'} &lt;{cfg.email_from || '—'}&gt;</span>
                </div>
                {recipientLoading && <div className="pt-1 text-xs text-slate-500 animate-pulse">Calculando destinatarios...</div>}
                {!recipientLoading && recipientStats && (
                  <div className="pt-1 border-t border-z-border mt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">
                        {bulkBatchSize ? `Esta tanda (de ${recipientStats.will_receive} totales)` : 'Recibirán el email'}
                      </span>
                      <span className="text-green-400 font-bold">
                        {bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive}
                      </span>
                    </div>
                    {bulkBatchSize && recipientStats.will_receive > recipientStats.will_receive_this_batch && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>Pendientes para próximas tandas</span>
                        <span>{recipientStats.will_receive - recipientStats.will_receive_this_batch}</span>
                      </div>
                    )}
                    {recipientStats.without_email > 0 && (
                      <div className="flex justify-between text-xs text-slate-500"><span>Sin email</span><span>{recipientStats.without_email}</span></div>
                    )}
                    {recipientStats.unsubscribed > 0 && (
                      <div className="flex justify-between text-xs text-slate-500"><span>Desuscritos</span><span>{recipientStats.unsubscribed}</span></div>
                    )}
                    {(bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive) === 0 && <p className="text-xs text-amber-400">⚠ No hay destinatarios válidos.</p>}
                    <button onClick={loadRecipientDetail} disabled={recipientDetailLoading}
                      className="mt-2 w-full text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/50 rounded-lg py-1.5 transition-colors disabled:opacity-50">
                      {recipientDetailLoading ? 'Cargando...' : 'Ver lista completa de contactos'}
                    </button>
                  </div>
                )}
              </div>
              {/* Schedule toggle */}
              <div className="px-4 pb-3 border-t border-z-border pt-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={scheduleMode} onChange={e => { setScheduleMode(e.target.checked); if (!e.target.checked) setScheduleAt('') }}
                    className="w-4 h-4 rounded accent-blue-500" />
                  <span className="text-sm text-slate-300">Programar envío para más tarde</span>
                </label>
                {scheduleMode && (
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                    onChange={e => setScheduleAt(e.target.value)}
                    className="w-full bg-slate-800 border border-z-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                  />
                )}
              </div>
              <div className="px-4 py-3 border-t border-z-border flex gap-2">
                <button onClick={sendBulk} disabled={(bulkBatchSize ? recipientStats?.will_receive_this_batch : recipientStats?.will_receive) === 0 || (scheduleMode && !scheduleAt)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                  {scheduleMode && scheduleAt
                    ? `Programar para ${new Date(scheduleAt).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}`
                    : `Confirmar envío${recipientStats ? ` (${bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive})` : ''}`}
                </button>
                <button onClick={() => { setConfirmStep(false); setScheduleMode(false); setScheduleAt('') }}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* ── Live progress panel ── */}
          {(bulkLoading || bulkJobProgress) && (
            <div className="rounded-xl border border-z-border bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-z-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bulkLoading && (
                    <svg className="animate-spin w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  )}
                  {!bulkLoading && bulkJobProgress?.status === 'done' && (
                    <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    {bulkLoading ? 'Enviando emails en progreso...' : 'Envío completado'}
                  </span>
                </div>
                {bulkJobProgress && (
                  <span className="text-sm font-bold text-green-400">
                    {bulkJobProgress.sent} / {bulkJobProgress.total}
                  </span>
                )}
              </div>

              {bulkJobProgress && (
                <>
                  {/* Progress bar */}
                  <div className="px-4 pt-3 pb-1">
                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all duration-500"
                        style={{ width: `${bulkJobProgress.total ? (bulkJobProgress.sent / bulkJobProgress.total) * 100 : 0}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>{bulkJobProgress.sent} enviados</span>
                      {bulkJobProgress.skipped > 0 && <span className="text-red-400">{bulkJobProgress.skipped} fallidos</span>}
                      <span>{bulkJobProgress.total - bulkJobProgress.sent - bulkJobProgress.skipped} pendientes</span>
                    </div>
                  </div>

                  {/* Sent emails list */}
                  {bulkJobProgress.sent_list?.length > 0 && (
                    <div className="px-4 pb-2">
                      <p className="text-xs text-slate-500 mb-1 mt-2">Enviados</p>
                      <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg bg-white/[0.03] border border-z-border p-2">
                        {bulkJobProgress.sent_list.slice().reverse().map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                            <CheckCircleIcon className="w-3 h-3 text-green-400 flex-shrink-0" />
                            <span className="text-slate-300 truncate">{item.name || item.email}</span>
                            <span className="text-slate-500 truncate">{item.name ? item.email : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failed emails */}
                  {bulkJobProgress.failed_list?.length > 0 && (
                    <div className="px-4 pb-3 border-t border-z-border mt-1">
                      <p className="text-xs text-red-400 mb-1 mt-2">Fallidos</p>
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {bulkJobProgress.failed_list.map((item, i) => (
                          <div key={i} className="flex justify-between text-xs">
                            <span className="text-slate-400 font-mono truncate">{item.email}</span>
                            <span className="text-red-400 truncate max-w-[180px] ml-2">{item.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!bulkLoading && bulkJobProgress?.status === 'done' && (
                <div className="px-4 py-3 border-t border-z-border">
                  <button onClick={() => { setBulkJobProgress(null); setBulkJobId(null) }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Nuevo envío</button>
                </div>
              )}
            </div>
          )}

          {bulkResult && !bulkLoading && !bulkJobProgress && (
            <div className={`rounded-xl border overflow-hidden ${bulkResult.error ? 'border-red-500/30 bg-red-500/5' : bulkResult.scheduled ? 'border-blue-500/30 bg-blue-500/5' : 'border-green-500/30 bg-green-500/5'}`}>
              <div className="px-5 py-4 flex items-center gap-4">
                <div className={`text-4xl font-black ${bulkResult.error ? 'text-red-400' : bulkResult.scheduled ? 'text-blue-400' : 'text-green-400'}`}>
                  {bulkResult.error ? '✗' : bulkResult.scheduled ? '⏰' : bulkResult.sent}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${bulkResult.error ? 'text-red-300' : bulkResult.scheduled ? 'text-blue-300' : 'text-green-300'}`}>
                    {bulkResult.error ? 'Error al enviar' : bulkResult.scheduled ? 'Envío programado' : `email${bulkResult.sent !== 1 ? 's' : ''} enviado${bulkResult.sent !== 1 ? 's' : ''} correctamente`}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {bulkResult.error ? bulkResult.error
                      : bulkResult.scheduled ? `Se enviará el ${new Date(bulkResult.scheduled_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}`
                      : bulkResult.skipped ? `${bulkResult.skipped} no pudieron enviarse` : 'Todos los emails fueron entregados'}
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-white/5">
                <button onClick={() => { setBulkResult(null); setErrorsOpen(false) }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">Nuevo envío</button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── 3. PLANTILLAS PROFESIONALES ── */}
      <Section id="plantillas-pro" label="Plantillas profesionales" icon={SparklesIcon} openSections={openSections} toggle={toggle}>
        <div className="divide-y divide-z-border">
          <p className="px-5 py-3 text-xs text-slate-500">Correos corporativos listos para usar. Haz clic en "Ver" para previsualizar y "Usar" para cargarlo en tu plantilla.</p>
          {PRO_GALLERY.map(({ key, label, tag, tagColor }) => {
            const pro = PRO_TEMPLATES[key]
            const isOpen = previewProKey === key
            return (
              <div key={key} className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${tagColor}`}>{tag}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500 truncate">{pro.subject.replace(/{{empresa}}/g, 'Empresa')}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setPreviewProKey(isOpen ? null : key)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                      <EyeIcon className="w-3.5 h-3.5" /> {isOpen ? 'Cerrar' : 'Ver'}
                    </button>
                    <button onClick={() => { loadProTemplate(key); setEditingTmpl(key); setPreviewOpen(false); toggle('mis-plantillas'); setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors font-medium">
                      <SparklesIcon className="w-3.5 h-3.5" /> Usar
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-white"
                    dangerouslySetInnerHTML={{ __html: buildHtml({ ...pro, greeting: pro.greeting.replace(/{{nombre}}/g, 'Carlos'), body: pro.body.replace(/{{nombre}}/g, 'Carlos').replace(/{{empresa}}/g, 'Empresa ABC').replace(/{{agente}}/g, 'Isabella'), signature: pro.signature.replace(/{{agente}}/g, 'Isabella') }) }} />
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 4. MIS PLANTILLAS ── */}
      <Section id="mis-plantillas" label="Mis plantillas" icon={PencilSquareIcon} openSections={openSections} toggle={toggle}>
        <div>
          {/* New template input */}
          <div className="px-5 py-3 border-b border-z-border flex items-center justify-between">
            <p className="text-xs text-slate-500">Haz clic en una para editarla. Las 5 fijas se usan en envíos automáticos post-llamada.</p>
            <button onClick={() => setShowNewInput(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors ml-3 flex-shrink-0">
              <PlusIcon className="w-3.5 h-3.5" /> Nueva
            </button>
          </div>
          {showNewInput && (
            <div className="px-5 py-3 border-b border-z-border bg-white/5 flex gap-2">
              <input autoFocus type="text" value={newTmplName}
                onChange={e => setNewTmplName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTemplate(); if (e.key === 'Escape') { setShowNewInput(false); setNewTmplName('') } }}
                placeholder="Nombre de la plantilla..." className="z-input-light text-sm flex-1" />
              <button onClick={createTemplate} disabled={!newTmplName.trim()} className="z-btn-primary text-xs disabled:opacity-50 whitespace-nowrap">Crear</button>
              <button onClick={() => { setShowNewInput(false); setNewTmplName('') }} className="z-btn-ghost text-xs">Cancelar</button>
            </div>
          )}
          <div className="divide-y divide-z-border">
            <div className="px-4 py-2 bg-white/3">
              <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">Automáticas post-llamada</p>
            </div>
            {FIXED_TEMPLATES.map(({ key, label, desc }) => {
              const filled = isFilled(key)
              const subject = cfg.email_templates[key]?.subject
              return (
                <div key={key}
                  className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-white/5 transition-colors ${editingTmpl === key ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''}`}
                  onClick={() => openEditor(key)}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${filled ? 'bg-green-400' : 'bg-slate-600'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-200">{label}</p>
                      <p className="text-xs text-slate-500 truncate">{filled && subject ? subject : desc}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                    {filled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Configurada</span>}
                    <PencilSquareIcon className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              )
            })}
            {customTemplates.length > 0 && (
              <>
                <div className="px-4 py-2 bg-white/3">
                  <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">Mis plantillas personalizadas</p>
                </div>
                {customTemplates.map(({ key, label }) => {
                  const filled = isFilled(key)
                  const subject = cfg.email_templates[key]?.subject
                  return (
                    <div key={key}
                      className={`flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-white/5 transition-colors ${editingTmpl === key ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''}`}
                      onClick={() => openEditor(key)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${filled ? 'bg-green-400' : 'bg-slate-600'}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-200">{label}</p>
                          <p className="text-xs text-slate-500 truncate">{filled && subject ? subject : 'Plantilla personalizada'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3" onClick={e => e.stopPropagation()}>
                        {filled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">Configurada</span>}
                        <button onClick={() => deleteTemplate(key)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Editor */}
          {editingTmpl && editingData && (
            <div ref={editorRef} className="border-t border-z-border">
              <div className="px-5 py-4 border-b border-z-border flex items-center justify-between bg-blue-500/5">
                <div>
                  {editingMeta?.isCustom ? (
                    <input type="text" defaultValue={editingMeta.label}
                      onBlur={e => renameTemplate(editingTmpl, e.target.value)}
                      className="text-sm font-semibold bg-transparent text-blue-400 border-b border-blue-400/40 focus:outline-none focus:border-blue-400 pb-0.5" />
                  ) : (
                    <h2 className="text-sm font-semibold text-slate-200">
                      Editando: <span className="text-blue-400">{editingMeta?.label}</span>
                    </h2>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">
                    Variables: <span className="font-mono text-blue-400">{'{{nombre}}  {{empresa}}  {{telefono}}  {{fecha}}  {{agente}}'}</span>
                  </p>
                </div>
                <button onClick={() => loadProTemplate(editingTmpl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors">
                  <SparklesIcon className="w-3.5 h-3.5" /> Plantilla profesional
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Asunto del email</label>
                  <input type="text" value={editingData.subject}
                    onChange={e => setTmplField(editingTmpl, 'subject', e.target.value)}
                    placeholder="ej: Próximos pasos — {{empresa}}" className="z-input-light text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Saludo</label>
                  <input type="text" value={editingData.greeting}
                    onChange={e => setTmplField(editingTmpl, 'greeting', e.target.value)}
                    placeholder="Estimado/a {{nombre}}," className="z-input-light text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Cuerpo del mensaje</label>
                  <textarea rows={6} value={editingData.body}
                    onChange={e => setTmplField(editingTmpl, 'body', e.target.value)}
                    placeholder="Escribe el contenido del email aquí..." className="z-input-light text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Texto del botón (opcional)</label>
                    <input type="text" value={editingData.cta_text}
                      onChange={e => setTmplField(editingTmpl, 'cta_text', e.target.value)}
                      placeholder="Agendar llamada" className="z-input-light text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">URL del botón</label>
                    <input type="url" value={editingData.cta_url}
                      onChange={e => setTmplField(editingTmpl, 'cta_url', e.target.value)}
                      placeholder="https://calendly.com/..." className="z-input-light text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Firma</label>
                  <textarea rows={2} value={editingData.signature}
                    onChange={e => setTmplField(editingTmpl, 'signature', e.target.value)}
                    placeholder={'Atentamente,\n{{agente}}'} className="z-input-light text-sm resize-none" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                    <PaperClipIcon className="w-3.5 h-3.5" /> Adjunto para esta plantilla (PDF o imagen, máx. 5 MB)
                  </label>
                  <div className="flex items-center gap-3">
                    <input ref={tmplAttachRef} type="file" accept=".pdf,image/*" className="hidden" onChange={uploadTmplAttach} />
                    <button onClick={() => tmplAttachRef.current?.click()} disabled={tmplAttachLoading}
                      className="z-btn-ghost border border-z-border text-xs disabled:opacity-50">
                      {tmplAttachLoading ? 'Subiendo...' : cfg.email_templates[editingTmpl]?.attachment_name ? 'Reemplazar adjunto' : 'Subir adjunto'}
                    </button>
                    {cfg.email_templates[editingTmpl]?.attachment_name && (
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[180px]">
                        ✓ {cfg.email_templates[editingTmpl].attachment_name}
                      </span>
                    )}
                  </div>
                  {tmplAttachMsg && (
                    <p className={`text-xs mt-1 ${tmplAttachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {tmplAttachMsg.ok ? `✓ ${tmplAttachMsg.text}` : tmplAttachMsg.text}
                    </p>
                  )}
                </div>
                <button onClick={() => setPreviewOpen(p => !p)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                  <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
                  {previewOpen ? 'Ocultar vista previa' : 'Ver vista previa del email'}
                </button>
                {previewOpen && (
                  <div className="rounded-lg overflow-hidden border border-gray-200"
                    dangerouslySetInnerHTML={{ __html: buildHtml(editingData) }} />
                )}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── 5. ENVÍO DE PRUEBA ── */}
      <Section id="prueba" label="Envío de prueba" icon={EnvelopeIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">Verifica que el email se ve bien antes de enviarlo a tus prospectos. Se envía con datos de ejemplo.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tu correo</label>
              <input type="email" value={testAddr} onChange={e => setTestAddr(e.target.value)}
                placeholder="mi@correo.com" className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Plantilla a probar</label>
              <select value={testTmpl} onChange={e => setTestTmpl(e.target.value)} className="z-input-light text-sm">
                {allTemplates.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const subj = cfg.email_templates[testTmpl]?.subject
            return subj
              ? <p className="text-xs text-slate-400">Asunto: <span className="italic">"{subj}"</span></p>
              : <p className="text-xs text-amber-400">⚠ Sin asunto configurado</p>
          })()}
          <button onClick={sendTest} disabled={testLoading || !testAddr || !cfg.sendgrid_configured}
            className="z-btn-primary disabled:opacity-50">
            {testLoading ? 'Enviando...' : 'Enviar prueba'}
          </button>
          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testMsg.ok ? '✓' : '✗'} {testMsg.text}
            </p>
          )}
        </div>
      </Section>

      {/* ── 6. CONFIGURACIÓN ── */}
      <Section id="config" label="Configuración automática" icon={Cog6ToothIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Email remitente</label>
              <input type="email" value={cfg.email_from} onChange={e => setCfg(p => ({ ...p, email_from: e.target.value }))}
                placeholder="info@empresa.com" className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Nombre remitente</label>
              <input type="text" value={cfg.email_from_name} onChange={e => setCfg(p => ({ ...p, email_from_name: e.target.value }))}
                placeholder="Isabella - Mi Empresa" className="z-input-light text-sm" />
            </div>
          </div>
          <div className="border-t border-z-border pt-4">
            <label className="text-xs text-slate-400 mb-1.5 block">Delay entre envíos</label>
            <select value={cfg.email_send_delay_ms} onChange={e => setCfg(p => ({ ...p, email_send_delay_ms: Number(e.target.value) }))}
              className="z-input-light text-sm w-full sm:w-auto">
              <option value={0}>Sin delay (máxima velocidad)</option>
              <option value={500}>500 ms</option>
              <option value={1000}>1 segundo</option>
              <option value={2000}>2 segundos</option>
              <option value={5000}>5 segundos</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">Un delay evita que grandes envíos activen filtros de spam.</p>
          </div>
          <div className="border-t border-z-border pt-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Automático post-llamada</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setCfg(p => ({ ...p, email_enabled: !p.email_enabled }))}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${cfg.email_enabled ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.email_enabled ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-slate-400">{cfg.email_enabled ? 'Activo' : 'Inactivo'}</span>
              </label>
            </div>
            <p className="text-xs text-slate-500">Selecciona para qué resultados enviar email automáticamente:</p>
            {[
              { flag: 'email_send_on_interested',    label: 'Interesado' },
              { flag: 'email_send_on_callback',       label: 'Callback' },
              { flag: 'email_send_on_voicemail',      label: 'Buzón de voz' },
              { flag: 'email_send_on_not_interested', label: 'No interesado' },
            ].map(({ flag, label }) => (
              <label key={flag} className={`flex items-center gap-2.5 cursor-pointer ${!cfg.email_enabled ? 'opacity-40 pointer-events-none' : ''}`}>
                <input type="checkbox" checked={cfg[flag]}
                  onChange={e => setCfg(p => ({ ...p, [flag]: e.target.checked }))}
                  className="w-4 h-4 accent-blue-500" />
                <span className="text-sm text-slate-300">{label}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button onClick={save} disabled={saving} className="z-btn-primary disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircleIcon className="w-4 h-4" /> Guardado</span>}
          </div>
        </div>
      </Section>

      {/* ── Envíos programados ── */}
      {scheduledJobs.length > 0 && (
        <div className="bg-z-card rounded-xl border border-blue-500/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-z-border flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Envíos programados</h2>
              <p className="text-xs text-slate-500 mt-0.5">{scheduledJobs.length} pendiente{scheduledJobs.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <div className="divide-y divide-z-border">
            {scheduledJobs.map(j => (
              <div key={j.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 font-medium">
                    {j.email_only ? 'Contactos de email' : j.campaign_id ? `Campaña #${j.campaign_id}` : 'Todos los prospectos'}
                    <span className="ml-2 text-xs text-slate-500 font-normal">· plantilla: {j.template_key}</span>
                  </p>
                  <p className="text-xs text-blue-300 mt-0.5">
                    {new Date(j.scheduled_at).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                </div>
                <button
                  onClick={async () => { await cancelScheduledEmail(j.id); loadScheduled() }}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1 rounded-lg transition-colors flex-shrink-0"
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 7. HISTORIAL ── */}
      {emailHistory.length > 0 && (
        <Section id="historial" label="Historial de envíos" icon={ClockIcon}
          badge={`${emailHistory.length} envíos`} openSections={openSections} toggle={toggle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-black/20">
                <tr>
                  {['Fecha', 'Plantilla', 'Campaña', 'Enviados', 'Fallidos', 'Por'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {emailHistory.map(h => (
                  <tr key={h.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(h.sent_at).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px]">
                      <p className="font-medium truncate">{allTemplates.find(t => t.key === h.template_key)?.label || h.template_key}</p>
                      {h.template_subject && <p className="text-slate-500 truncate">{h.template_subject}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{h.campaign_name || 'Todos'}</td>
                    <td className="px-4 py-2.5"><span className="text-green-400 font-bold text-sm">{h.total_sent}</span></td>
                    <td className="px-4 py-2.5">
                      {h.total_errors > 0 ? (
                        <button
                          onClick={() => setErrorDetailLog(h)}
                          className="text-red-400 font-medium text-sm hover:text-red-300 hover:underline transition-colors"
                          title="Ver detalle de errores"
                        >
                          {h.total_errors} ▸
                        </button>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-[120px]">{h.initiated_by || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* Modal: vista previa de destinatarios */}
      {recipientDetailOpen && recipientDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-z-border flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-100">Lista de contactos</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {recipientDetail.will_receive.length} recibirán · {recipientDetail.skipped.length} omitidos
                </p>
              </div>
              <button onClick={() => setRecipientDetailOpen(false)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex border-b border-z-border flex-shrink-0">
              <button onClick={() => setRecipientDetailTab('will_receive')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${recipientDetailTab === 'will_receive' ? 'text-green-400 border-b-2 border-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                Recibirán el email ({recipientDetail.will_receive.length})
              </button>
              <button onClick={() => setRecipientDetailTab('skipped')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${recipientDetailTab === 'skipped' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
                Omitidos ({recipientDetail.skipped.length})
              </button>
            </div>
            <div className="overflow-auto flex-1">
              {recipientDetailTab === 'will_receive' && (
                recipientDetail.will_receive.length === 0
                  ? <p className="text-center text-slate-500 text-sm py-10">No hay contactos que recibirán el email</p>
                  : <table className="w-full text-sm">
                      <thead className="bg-black/20 sticky top-0">
                        <tr>{['Nombre', 'Email', 'Teléfono', 'Campaña'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-z-border">
                        {recipientDetail.will_receive.map(c => (
                          <tr key={c.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{c.name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-300 font-mono text-xs">{c.email}</td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{c.phone || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{c.campaign || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              )}
              {recipientDetailTab === 'skipped' && (
                recipientDetail.skipped.length === 0
                  ? <p className="text-center text-slate-500 text-sm py-10">No hay contactos omitidos</p>
                  : <table className="w-full text-sm">
                      <thead className="bg-black/20 sticky top-0">
                        <tr>{['Nombre', 'Email', 'Teléfono', 'Campaña', 'Razón'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-z-border">
                        {recipientDetail.skipped.map(c => (
                          <tr key={c.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{c.name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{c.email || <span className="text-slate-600 italic">sin email</span>}</td>
                            <td className="px-4 py-2.5 text-slate-400 text-xs">{c.phone || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{c.campaign || '—'}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.reason === 'Desuscrito' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                {c.reason}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
              )}
            </div>
            <div className="p-4 border-t border-z-border flex-shrink-0 flex justify-end">
              <button onClick={() => setRecipientDetailOpen(false)} className="z-btn-ghost text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle de errores del historial */}
      {errorDetailLog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-z-border flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-100">Detalle de fallos</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {errorDetailLog.total_errors} email{errorDetailLog.total_errors !== 1 ? 's' : ''} no pudieron enviarse
                  {errorDetailLog.template_subject && ` · "${errorDetailLog.template_subject}"`}
                </p>
              </div>
              <button onClick={() => setErrorDetailLog(null)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {errorDetailLog.error_details?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-black/20 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Email</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {errorDetailLog.error_details.map((e, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-300 whitespace-nowrap">{e.email}</td>
                        <td className="px-4 py-2.5 text-xs text-red-400 break-all">{e.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-slate-400 text-sm">No hay detalle disponible para este envío.</p>
                  <p className="text-xs mt-1 text-slate-600">Los envíos anteriores a esta versión no guardan el detalle de errores.</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-z-border flex-shrink-0 flex justify-between items-center">
              <span className="text-xs text-slate-600">
                {errorDetailLog.error_details?.length > 0 ? 'Causas comunes: email inválido, dominio inexistente, buzón lleno, o bloqueado por spam.' : ''}
              </span>
              <button onClick={() => setErrorDetailLog(null)} className="z-btn-ghost text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
