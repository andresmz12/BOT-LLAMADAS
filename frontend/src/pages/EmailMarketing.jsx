import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

// All times are stored/sent as UTC. The system operates at UTC-5.
const UTC_OFFSET = -5
const toUTC5Display = (isoUtc) => {
  if (!isoUtc) return ''
  const d = new Date(isoUtc)
  d.setHours(d.getHours() + UTC_OFFSET)
  return d.toISOString().slice(0, 16)  // "YYYY-MM-DDTHH:MM" in UTC-5
}
const fromUTC5ToISO = (localStr) => {
  // localStr is "YYYY-MM-DDTHH:MM" interpreted as UTC-5, convert to UTC ISO
  if (!localStr) return ''
  const d = new Date(localStr + ':00Z')
  d.setHours(d.getHours() - UTC_OFFSET)
  return d.toISOString()
}
const displayUTC5 = (isoUtc, locale) => {
  if (!isoUtc) return ''
  const d = new Date(isoUtc)
  d.setHours(d.getHours() + UTC_OFFSET)
  return d.toLocaleString(locale || 'es', { dateStyle: 'medium', timeStyle: 'short' })
}

import {
  CheckCircleIcon, EnvelopeIcon, PaperClipIcon, ChevronDownIcon,
  PencilSquareIcon, SparklesIcon, PlusIcon, TrashIcon, EyeIcon,
  ClockIcon, UserMinusIcon, ListBulletIcon, Cog6ToothIcon, PaperAirplaneIcon,
  ArrowDownTrayIcon, ChartBarIcon, CheckIcon, XMarkIcon,
} from '@heroicons/react/24/outline'
import {
  getEmailSettings, saveEmailSettings, uploadEmailAttachment, deleteEmailAttachment, deleteEmailTemplate,
  sendTestEmail, bulkSendEmail, getBulkSendStatus, getActiveBulkSend, pauseBulkSend, resumeBulkSend, cancelBulkSend, getCampaigns,
  getEmailHistory, validateEmailRecipients, uploadTemplateAttachment,
  getEmailContactsCount, importEmailContacts, getEmailRecipientsDetail,
  getEmailLists, createEmailList, renameEmailList, deleteEmailList,
  getEmailListContacts, deleteEmailListContact, addEmailListContact, importEmailContactsToList, deleteTemplateAttachment,
  getScheduledEmails, cancelScheduledEmail, rescheduleEmail, toggleContactUnsubscribe, blockContactEmail, getEmailEvents, labelContact,
  updateProspect,
  generateEmailSequence, createEmailSequence, getEmailSequences, updateSequenceStep, deleteEmailSequence,
} from '../api/client'
import { errText } from '../utils/errText'

const FIXED_KEYS_LIST = ['general', 'interested', 'callback_requested', 'voicemail', 'not_interested']
const FIXED_KEYS = new Set(FIXED_KEYS_LIST)
const EMPTY_TMPL = { subject: '', greeting: '', body: '', cta_text: '', cta_url: '', cta_text_2: '', cta_url_2: '', signature: '' }

// Pro-template body content is real email copy sent to the built-in
// gallery preview — kept as plain per-language data (not routed through
// i18next interpolation) since the strings themselves contain literal
// {{merge_field}} tokens that must not be swallowed by t()'s own
// interpolation engine.
const PRO_TEMPLATES_ES = {
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

const PRO_TEMPLATES_EN = {
  general: {
    subject: 'Information about our services — {{empresa}}',
    greeting: 'Dear {{nombre}},',
    body: "I'm reaching out to introduce how we can help {{empresa}} improve its results.\n\nOur team has worked with companies in your industry achieving concrete, measurable results. I'd love to schedule a brief 15-minute call to share the details.\n\nWould you have availability this week?",
    cta_text: 'Book a call', cta_url: '', signature: 'Sincerely,\n{{agente}}',
  },
  interested: {
    subject: 'Next steps — {{empresa}}',
    greeting: 'Dear {{nombre}},',
    body: "It was a pleasure speaking with you today. I'm glad to hear about your interest.\n\nAs we discussed, here are the next steps:\n\n1. We'll prepare a personalized proposal for {{empresa}}\n2. We'll review it together on a video call\n3. We'll define the work plan\n\nWe look forward to your confirmation to get started as soon as possible.",
    cta_text: 'Confirm meeting', cta_url: '', signature: "I'm happy to help,\n{{agente}}",
  },
  callback_requested: {
    subject: "We'll be in touch soon — {{empresa}}",
    greeting: 'Dear {{nombre}},',
    body: 'Thank you for taking the time to speak with us today.\n\nAs agreed, one of our advisors will contact you shortly to continue the conversation and answer all your questions, with no obligation.\n\nIf you\'d prefer to reach out sooner or change the time, feel free to reply to this email.',
    cta_text: '', cta_url: '', signature: 'See you soon,\n{{agente}}',
  },
  voicemail: {
    subject: 'We tried to reach you — {{empresa}}',
    greeting: 'Dear {{nombre}},',
    body: "We tried to reach you today and we're sorry we couldn't speak with you directly.\n\nWe have a proposal that could be of great value to {{empresa}} and we'd like to present it to you personally.\n\nPlease let us know the best time to call by replying to this email, or book a time directly using the link below.",
    cta_text: 'Choose a time', cta_url: '', signature: 'We remain at your service,\n{{agente}}',
  },
  not_interested: {
    subject: 'Thank you for your time — {{empresa}}',
    greeting: 'Dear {{nombre}},',
    body: "Thank you for giving us your time today.\n\nWe completely understand that this isn't a priority right now. Circumstances change, and when the right moment comes, we'll be here to help.\n\nIf you need support in this area in the future, don't hesitate to reach out.",
    cta_text: '', cta_url: '', signature: 'Thank you very much,\n{{agente}}',
  },
}

function formatBody(text, emptyHtml) {
  if (!text) return emptyHtml
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

function formatSignature(text, emptyHtml) {
  if (!text) return emptyHtml
  return text.split('\n').join('<br>')
}

function buildCtaButton(text, url, primary, defaultLabel) {
  const label = text || (url ? defaultLabel : '')
  if (!label || !url) return ''
  const bg = primary ? '#1e40af' : '#475569'
  return `<a href="${url}" style="background:${bg};color:#fff;padding:10px 24px;border-radius:4px;text-decoration:none;font-weight:600;display:inline-block;font-size:13px;margin:0 6px">${label}</a>`
}

function buildHtml(t, labels) {
  // Explicit &nbsp; separator (not just CSS margin) so the two buttons never
  // visually run together — some email clients strip inline margin on <a>.
  const buttons = [buildCtaButton(t.cta_text, t.cta_url, true, labels.ctaDefault), buildCtaButton(t.cta_text_2, t.cta_url_2, false, labels.ctaDefault)]
    .filter(Boolean)
    .join('&nbsp;&nbsp;&nbsp;&nbsp;')
  const cta = buttons ? `<p style="text-align:center;margin:20px 0">${buttons}</p>` : ''
  return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:4px;overflow:hidden;color:#111827">
  <div style="padding:28px 32px;border-bottom:1px solid #e5e7eb">
    <p style="margin:0 0 16px;color:#111827;font-size:14px">${t.greeting || labels.greetingEmpty}</p>
    <div style="line-height:1.75">${formatBody(t.body, labels.bodyEmpty)}</div>
    ${cta}
  </div>
  <div style="padding:16px 32px;background:#f9fafb">
    <p style="color:#6b7280;font-size:12px;margin:0">${formatSignature(t.signature, labels.signatureEmpty)}</p>
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
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'es'
  const isEn = dateLocale === 'en'
  const PRO_TEMPLATES = isEn ? PRO_TEMPLATES_EN : PRO_TEMPLATES_ES

  const FIXED_TEMPLATES = FIXED_KEYS_LIST.map(key => ({
    key,
    label: t(`emailMarketing.fixedTemplates.${key}.label`),
    desc: t(`emailMarketing.fixedTemplates.${key}.desc`),
  }))
  const PRO_GALLERY = FIXED_KEYS_LIST.map(key => {
    const TAG_COLOR = {
      general: 'bg-slate-500/20 text-slate-400',
      interested: 'bg-green-500/20 text-green-400',
      callback_requested: 'bg-blue-500/20 text-blue-400',
      voicemail: 'bg-amber-500/20 text-amber-400',
      not_interested: 'bg-red-500/20 text-red-400',
    }
    return {
      key,
      label: t(`emailMarketing.proGallery.${key}.label`),
      tag: t(`emailMarketing.proGallery.${key}.tag`),
      tagColor: TAG_COLOR[key],
    }
  })

  const buildHtmlLabels = {
    greetingEmpty: `<span style="color:#9ca3af;font-style:italic">${t('emailMarketing.buildHtml.greetingPlaceholder')}</span>`,
    bodyEmpty: `<span style="color:#9ca3af;font-style:italic">${t('emailMarketing.buildHtml.bodyPlaceholder')}</span>`,
    signatureEmpty: `<span style="font-style:italic;color:#9ca3af">${t('emailMarketing.buildHtml.signaturePlaceholder')}</span>`,
    ctaDefault: t('emailMarketing.buildHtml.defaultCtaLabel'),
  }

  const TABS = [
    { id: 'contactos', label: t('emailMarketing.tabContacts'), icon: ListBulletIcon },
    { id: 'enviar', label: t('emailMarketing.tabSend'), icon: PaperAirplaneIcon },
    { id: 'plantillas', label: t('emailMarketing.tabTemplates'), icon: SparklesIcon },
    { id: 'analitica', label: t('emailMarketing.tabAnalytics'), icon: ChartBarIcon },
  ]

  const LABEL_OPTIONS = [
    { value: null, label: t('emailMarketing.lists.labelNone'), color: 'text-slate-400', bg: 'bg-slate-700/40' },
    { value: 'interested', label: t('emailMarketing.lists.labelInterested'), color: 'text-green-400', bg: 'bg-green-500/15' },
    { value: 'not_interested', label: t('emailMarketing.lists.labelNotInterested'), color: 'text-red-400', bg: 'bg-red-500/15' },
    { value: 'converted', label: t('emailMarketing.lists.labelConverted'), color: 'text-yellow-400', bg: 'bg-yellow-500/15' },
    { value: 'do_not_contact', label: t('emailMarketing.lists.labelDoNotContact'), color: 'text-slate-500', bg: 'bg-slate-800' },
  ]

  const getLabelMeta = (label) => LABEL_OPTIONS.find(o => o.value === label) || LABEL_OPTIONS[0]

  const [cfg, setCfg] = useState({
    email_enabled: false, email_from: '', email_from_name: '',
    sendgrid_configured: false,
    email_send_on_interested: false, email_send_on_callback: false,
    email_send_on_voicemail: false, email_send_on_not_interested: false,
    email_templates: {}, email_attachment_name: null, email_attachment_2_name: null,
    email_send_delay_ms: 0,
  })
  const [campaigns, setCampaigns] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Accordion
  const [openSections, setOpenSections] = useState(new Set(['listas', 'envio']))
  const [activeTab, setActiveTab] = useState('contactos')
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
  const [renamingListId, setRenamingListId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)
  const [downloadingListId, setDownloadingListId] = useState(null)
  const [editingContactId, setEditingContactId] = useState(null)
  const [editContactForm, setEditContactForm] = useState({ name: '', email: '', company: '' })
  const [savingEditContact, setSavingEditContact] = useState(false)
  const [listContacts, setListContacts] = useState({ id: null, contacts: [], loading: false })
  const [contactSearch, setContactSearch] = useState('')
  const [contactLabelFilter, setContactLabelFilter] = useState('all')
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
  const [batchNumber, setBatchNumber] = useState(1)
  const bulkPollRef = useRef(null)

  // Test send
  const [testAddr, setTestAddr] = useState('')
  const [testTmpl, setTestTmpl] = useState('general')
  const [testLoading, setTestLoading] = useState(false)
  const [testMsg, setTestMsg] = useState(null)

  // History error detail modal
  const [errorDetailLog, setErrorDetailLog] = useState(null) // {template_subject, error_details:[]}
  const [sentDetailLog, setSentDetailLog] = useState(null)   // {template_subject, total_sent, sent_details:[]}

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
  const [rescheduleModal, setRescheduleModal] = useState(null) // { id, scheduled_at }
  const [scheduleMode, setScheduleMode] = useState(false)

  // Email sequences (drip campaigns)
  const [sequences, setSequences] = useState([])
  const [seqForm, setSeqForm] = useState({ name: '', email_list_id: '', objective: '', tone: 'Profesional', language: 'Español' })
  const [seqDates, setSeqDates] = useState([''])
  const [seqGenerating, setSeqGenerating] = useState(false)
  const [seqGenerated, setSeqGenerated] = useState(null) // [{date, subject, body}]
  const [seqCreating, setSeqCreating] = useState(false)
  const [seqError, setSeqError] = useState(null)

  // Tracking events
  const [trackingTab, setTrackingTab] = useState('all')
  const [trackingEvents, setTrackingEvents] = useState(null) // null = not loaded
  const [trackingLoading, setTrackingLoading] = useState(false)
  const [scheduleAt, setScheduleAt] = useState('')
  const fileRef = useRef(null)
  const attachRef = useRef(null)
  const attach2Ref = useRef(null)
  const tmplAttachRef = useRef(null)
  const tmplAttach2Ref = useRef(null)
  const emailImportRef = useRef(null)
  const editorRef = useRef(null)

  const loadHistory = () => getEmailHistory().then(setEmailHistory).catch(() => {})

  const loadTrackingEvents = async () => {
    setTrackingLoading(true)
    try {
      const r = await getEmailEvents()
      setTrackingEvents(r.events || [])
    } catch (_) { setTrackingEvents([]) }
    finally { setTrackingLoading(false) }
  }

  const exportTrackingToExcel = () => {
    if (!trackingEvents?.length) return
    const LABEL = { delivered: t('emailMarketing.analytics.eventDelivered'), open: t('emailMarketing.analytics.eventOpen'), click: t('emailMarketing.analytics.eventClick'), bounce: t('emailMarketing.analytics.eventBounce'), dropped: t('emailMarketing.analytics.eventDropped'), unsubscribe: t('emailMarketing.analytics.eventUnsubscribe'), spamreport: t('emailMarketing.analytics.eventSpamreport') }
    const filtered = trackingTab === 'all' ? trackingEvents : trackingEvents.filter(e => e.event_type === trackingTab)
    import('xlsx').then(XLSX => {
      const rows = filtered.map(e => ({
        'Email': e.email,
        'Evento': LABEL[e.event_type] || e.event_type,
        'Plantilla': e.template_key || '',
        'URL (click)': e.url || '',
        'Fecha y hora': e.timestamp ? new Date(e.timestamp).toLocaleString(dateLocale) : '',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Seguimiento')
      XLSX.writeFile(wb, `email-tracking-${trackingTab}-${new Date().toISOString().slice(0,10)}.xlsx`)
    })
  }
  const loadScheduled = () => getScheduledEmails().then(setScheduledJobs).catch(() => {})
  const loadSequences = () => getEmailSequences().then(setSequences).catch(() => {})
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
      email_attachment_2_name: d.email_attachment_2_name || null,
      email_send_delay_ms: d.email_send_delay_ms ?? 0,
    })).catch(() => {})
    getCampaigns().then(setCampaigns).catch(() => {})
    loadHistory()
    loadEmailContactsCount()
    loadEmailLists()
    loadScheduled()
    loadSequences()
    // Reattach to an in-progress bulk send if one exists (survives page refresh)
    getActiveBulkSend().then(status => {
      if (status.job_id) {
        setBulkJobId(status.job_id)
        setBulkJobProgress(status)
        setBulkLoading(true)
        startBulkPolling(status.job_id)
        setOpenSections(prev => { const next = new Set(prev); next.add('envio'); return next })
      }
    }).catch(() => {})
  }, [])

  const startBulkPolling = (jobId) => {
    if (bulkPollRef?.current) { clearInterval(bulkPollRef.current); bulkPollRef.current = null }
    bulkPollRef.current = setInterval(async () => {
      try {
        const status = await getBulkSendStatus(jobId)
        setBulkJobProgress(status)
        if (status.status === 'done' || status.status === 'error') {
          clearInterval(bulkPollRef.current); bulkPollRef.current = null
          setBulkLoading(false); loadHistory()
          if (status.status === 'done') {
            try {
              const freshStats = await validateEmailRecipients({ ...parseBulkTarget(), skip_labeled: true })
              setRecipientStats(freshStats)
            } catch (_) {}
          }
        }
      } catch (_) {
        clearInterval(bulkPollRef.current); bulkPollRef.current = null
        setBulkLoading(false)
      }
    }, 2000)
  }

  const togglePauseBulk = async () => {
    if (!bulkJobId || !bulkJobProgress) return
    try {
      const updated = bulkJobProgress.status === 'paused'
        ? await resumeBulkSend(bulkJobId)
        : await pauseBulkSend(bulkJobId)
      setBulkJobProgress(updated)
    } catch (_) {}
  }

  const cancelBulk = async () => {
    if (!bulkJobId) return
    if (!window.confirm(t('emailMarketing.bulk.confirmCancel'))) return
    try {
      await cancelBulkSend(bulkJobId)
      setBulkJobId(null)
      setBulkJobProgress(null)
      setBulkLoading(false)
    } catch (_) {}
  }

  // Template helpers
  const customTemplates = Object.keys(cfg.email_templates)
    .filter(k => !FIXED_KEYS.has(k))
    .map(k => ({ key: k, label: cfg.email_templates[k]._label || k, isCustom: true, desc: t('emailMarketing.myTemplates.customDesc') }))
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

  const deleteTemplate = async (key) => {
    if (!confirm(t('emailMarketing.myTemplates.confirmDeleteTemplate'))) return
    setCfg(p => { const t = { ...p.email_templates }; delete t[key]; return { ...p, email_templates: t } })
    if (editingTmpl === key) setEditingTmpl(null)
    try {
      // Delete immediately on the backend — don't rely on the next "Guardar
      // cambios" click to persist this via omission from the saved payload.
      await deleteEmailTemplate(key)
    } catch (e) {
      alert(e.response?.data?.detail || t('emailMarketing.myTemplates.errorDeleteTemplate'))
    }
  }

  const renameTemplate = (key, newName) =>
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [key]: { ...p.email_templates[key], _label: newName } } }))

  const loadProTemplate = (key) => {
    const pro = PRO_TEMPLATES[key] || PRO_TEMPLATES.general
    setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [key]: { ...(p.email_templates[key] || {}), ...pro } } }))
  }

  const isFilled = (key) => { const t = cfg.email_templates[key]; return t && !!t.subject?.trim() && !!t.body?.trim() }

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
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.genericError')) }
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
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.lists.errorCreateList')) }
    finally { setCreatingList(false) }
  }

  const startRenameList = (list) => {
    setRenamingListId(list.id)
    setRenameValue(list.name)
  }

  const cancelRenameList = () => {
    setRenamingListId(null)
    setRenameValue('')
  }

  const handleSaveRenameList = async (id) => {
    const name = renameValue.trim()
    if (!name) return
    setSavingRename(true)
    try {
      const updated = await renameEmailList(id, name)
      setEmailLists(prev => prev.map(l => l.id === id ? { ...l, name: updated.name } : l))
      setRenamingListId(null); setRenameValue('')
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.lists.errorRenameList')) }
    finally { setSavingRename(false) }
  }

  const handleDeleteList = async (id) => {
    const list = emailLists.find(l => l.id === id)
    if (!confirm(t('emailMarketing.lists.confirmDeleteList', { name: list?.name, total: list?.total }))) return
    try {
      await deleteEmailList(id)
      setEmailLists(prev => prev.filter(l => l.id !== id))
      if (listContacts.id === id) setListContacts({ id: null, contacts: [], loading: false })
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.lists.errorDeleteList')) }
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

  const handleDownloadList = async (list) => {
    setDownloadingListId(list.id)
    try {
      const contacts = listContacts.id === list.id ? listContacts.contacts : await getEmailListContacts(list.id)
      if (!contacts.length) { alert(t('emailMarketing.lists.emptyListDownload')); return }
      const XLSX = await import('xlsx')
      const rows = contacts.map(c => ({
        [t('emailMarketing.lists.colName')]: c.name || '',
        [t('emailMarketing.lists.colEmail')]: c.email || '',
        [t('emailMarketing.lists.colCompany')]: c.company || '',
        [t('emailMarketing.lists.colLabel')]: c.email_label || '',
        [t('emailMarketing.lists.colUnsubscribed')]: c.unsubscribed ? t('emailMarketing.lists.yes') : t('emailMarketing.lists.no'),
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      const sheetName = (list.name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Lista').slice(0, 31)
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
      XLSX.writeFile(wb, `${list.name}.xlsx`)
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.lists.errorDownloadList')) }
    finally { setDownloadingListId(null) }
  }

  const startEditContact = (c) => {
    setEditingContactId(c.id)
    setEditContactForm({ name: c.name || '', email: c.email || '', company: c.company || '' })
  }

  const cancelEditContact = () => {
    setEditingContactId(null)
    setEditContactForm({ name: '', email: '', company: '' })
  }

  const handleSaveEditContact = async (listId, contactId) => {
    setSavingEditContact(true)
    try {
      const updated = await updateProspect(contactId, {
        name: editContactForm.name.trim(),
        email: editContactForm.email.trim(),
        company: editContactForm.company.trim(),
      })
      setListContacts(prev => ({
        ...prev,
        contacts: prev.contacts.map(c => c.id === contactId
          ? { ...c, name: updated.name, email: updated.email, company: updated.company }
          : c),
      }))
      setEditingContactId(null)
    } catch (e) { alert(errText(e.response?.data?.detail, t('emailMarketing.lists.errorEditContact'))) }
    finally { setSavingEditContact(false) }
  }

  const handleDeleteContact = async (listId, contactId, email) => {
    if (!confirm(t('emailMarketing.lists.confirmRemoveContact', { email: email || t('emailMarketing.lists.confirmRemoveContactFallback') }))) return
    try {
      await deleteEmailListContact(listId, contactId)
      setListContacts(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== contactId) }))
      setEmailLists(prev => prev.map(l =>
        l.id === listId ? { ...l, total: Math.max(0, l.total - 1), with_email: Math.max(0, l.with_email - 1) } : l
      ))
    } catch (e) { alert(t('emailMarketing.lists.errorRemoveContact')) }
  }

  const handleUnsubscribeAndDelete = async (listId, contactId) => {
    if (!confirm(t('emailMarketing.lists.confirmBlockContact'))) return
    try {
      await blockContactEmail(contactId)
      setListContacts(prev => ({ ...prev, contacts: prev.contacts.filter(c => c.id !== contactId) }))
      setEmailLists(prev => prev.map(l =>
        l.id === listId ? { ...l, total: Math.max(0, l.total - 1), with_email: Math.max(0, l.with_email - 1) } : l
      ))
    } catch (e) { alert(t('emailMarketing.lists.errorBlockContact')) }
  }

  const handleLabelContact = async (contactId, label) => {
    try {
      const result = await labelContact(contactId, label, null)
      setListContacts(prev => ({
        ...prev,
        contacts: prev.contacts.map(c =>
          c.id === contactId ? { ...c, email_label: result.email_label, unsubscribed: result.email_unsubscribed } : c
        )
      }))
    } catch (e) { alert(t('emailMarketing.lists.errorLabelContact')) }
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
      setAddContactForm(p => ({ ...p, saving: false, error: e.response?.data?.detail || t('emailMarketing.lists.errorAddContact') }))
    }
  }

  const handleImportToList = async (listId, file) => {
    if (!file) return
    try {
      const r = await importEmailContactsToList(listId, file)
      const msg = t('emailMarketing.lists.importSummary', {
        imported: r.imported,
        skipped: r.skipped ? t('emailMarketing.lists.importSkipped', { count: r.skipped }) : '',
      }) + (r.errors?.length ? `\n${r.errors.join('\n')}` : '')
      alert(msg)
      loadEmailLists()
      if (listContacts.id === listId) handleViewContacts(listId)
    } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.lists.errorImport')) }
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
        skip_labeled: true,
        ...(scheduleMode && scheduleAt ? { scheduled_at: fromUTC5ToISO(scheduleAt) } : {}),
      }
      const r = await bulkSendEmail(payload)
      if (r.scheduled) {
        setBulkResult(r)
        setScheduleMode(false); setScheduleAt('')
        loadScheduled()
        setBulkLoading(false)
      } else if (r.job_id) {
        setBulkJobId(r.job_id)
        setBulkJobProgress({ status: 'running', sent: 0, skipped: 0, total: r.total, sent_list: [], failed_list: [] })
        startBulkPolling(r.job_id)
      } else {
        setBulkResult(r)
        setScheduleMode(false); setScheduleAt('')
        loadHistory()
        setBulkLoading(false)
      }
    } catch (e) {
      setBulkResult({ error: e.response?.data?.detail || t('emailMarketing.bulk.errorStartingSend') })
      setBulkLoading(false)
    }
  }

  const prepareSend = async () => {
    setConfirmStep(true); setBulkResult(null); setRecipientStats(null)
    setRecipientDetail(null); setRecipientDetailOpen(false); setRecipientLoading(true)
    try {
      const stats = await validateEmailRecipients({ ...parseBulkTarget(), skip_labeled: true })
      setRecipientStats(stats)
    } catch (e) { /* non-critical */ }
    finally { setRecipientLoading(false) }
  }

  const sendNextBatch = () => {
    setBatchNumber(n => n + 1)
    setBulkJobId(null)
    setBulkJobProgress(null)
    sendBulk()
  }

  const resumeFromHistory = (h) => {
    if (h.source_email_list_id) {
      setBulkCampaign(`list:${h.source_email_list_id}`)
    } else if (h.source_email_only) {
      setBulkCampaign('email_only')
    } else if (h.campaign_id) {
      setBulkCampaign(String(h.campaign_id))
    } else {
      setBulkCampaign('')
    }
    setBulkTmpl(h.template_key)
    setBulkBatchSize(h.source_batch_size ? String(h.source_batch_size) : '')
    setBulkJobProgress(null); setBulkJobId(null); setBulkResult(null)
    setBatchNumber(1)
    setOpenSections(prev => { const next = new Set(prev); next.add('envio'); return next })
    setTimeout(() => prepareSend(), 50)
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
    } catch (err) { setImportResult({ error: err.response?.data?.detail || t('emailMarketing.lists.errorImport') }) }
    finally { setImportLoading(false); e.target.value = '' }
  }

  const uploadTmplAttach = async (e, slot = 1) => {
    const f = e.target.files?.[0]; if (!f || !editingTmpl) return
    if (f.size > 5 * 1024 * 1024) { setTmplAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.attachmentTooBig') }); return }
    setTmplAttachLoading(true); setTmplAttachMsg(null)
    const nameField = slot === 1 ? 'attachment_name' : 'attachment_name_2'
    try {
      const r = await uploadTemplateAttachment(editingTmpl, f, slot)
      setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [editingTmpl]: { ...(p.email_templates[editingTmpl] || {}), [nameField]: r.filename } } }))
      setTmplAttachMsg({ ok: true, text: r.filename })
    } catch (e) { setTmplAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.errorUploadAttachment') }) }
    finally { setTmplAttachLoading(false) }
  }

  const removeTmplAttach = async (slot = 1) => {
    if (!editingTmpl) return
    setTmplAttachLoading(true); setTmplAttachMsg(null)
    const nameField = slot === 1 ? 'attachment_name' : 'attachment_name_2'
    try {
      await deleteTemplateAttachment(editingTmpl, slot)
      setCfg(p => ({ ...p, email_templates: { ...p.email_templates, [editingTmpl]: { ...(p.email_templates[editingTmpl] || {}), [nameField]: null } } }))
      setTmplAttachMsg({ ok: true, text: t('emailMarketing.myTemplates.attachmentRemoved') })
    } catch (e) { setTmplAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.errorDeleteAttachment') }) }
    finally { setTmplAttachLoading(false) }
  }

  const sendTest = async () => {
    if (!testAddr) return
    setTestLoading(true); setTestMsg(null)
    try {
      await sendTestEmail({ to_email: testAddr, outcome: testTmpl, template: cfg.email_templates[testTmpl] || {}, from_email_override: cfg.email_from || null, from_name_override: cfg.email_from_name || null })
      setTestMsg({ ok: true, text: t('emailMarketing.test.success') })
    } catch (e) { setTestMsg({ ok: false, text: e.response?.data?.detail || t('emailMarketing.test.error') }) }
    finally { setTestLoading(false) }
  }

  const uploadAttach = async (e, slot = 1) => {
    const f = e.target.files?.[0]; if (!f) return
    if (f.size > 5 * 1024 * 1024) { setAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.attachmentTooBig') }); return }
    setAttachLoading(true); setAttachMsg(null)
    const field = slot === 1 ? 'email_attachment_name' : 'email_attachment_2_name'
    try {
      const r = await uploadEmailAttachment(f, slot)
      setCfg(p => ({ ...p, [field]: r.filename }))
      setAttachMsg({ ok: true, text: r.filename })
    } catch (e) { setAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.errorUploadAttachment') }) }
    finally { setAttachLoading(false) }
  }

  const removeAttach = async (slot = 1) => {
    setAttachLoading(true); setAttachMsg(null)
    const field = slot === 1 ? 'email_attachment_name' : 'email_attachment_2_name'
    try {
      await deleteEmailAttachment(slot)
      setCfg(p => ({ ...p, [field]: null }))
      setAttachMsg({ ok: true, text: t('emailMarketing.config.globalAttachmentRemoved') })
    } catch (e) { setAttachMsg({ ok: false, text: t('emailMarketing.myTemplates.errorDeleteAttachment') }) }
    finally { setAttachLoading(false) }
  }

  const addSeqDate = () => setSeqDates(p => [...p, ''])
  const removeSeqDate = (i) => setSeqDates(p => p.filter((_, idx) => idx !== i))
  const updateSeqDate = (i, v) => setSeqDates(p => p.map((d, idx) => idx === i ? v : d))

  // Date-only pickers are interpreted as 9am local (UTC-5), matching the rest
  // of the scheduling UI — without this, a bare "YYYY-MM-DD" parses as
  // midnight UTC, which is 7pm the day before in UTC-5.
  const dateOnlyToUTC5ISO = (d) => fromUTC5ToISO(`${d}T09:00`)

  const handleGenerateSequence = async () => {
    const dates = seqDates.filter(Boolean).map(dateOnlyToUTC5ISO)
    if (!seqForm.email_list_id || !seqForm.objective || dates.length === 0) {
      setSeqError(t('emailMarketing.sequences.errorMissingFields')); return
    }
    setSeqError(null); setSeqGenerating(true)
    try {
      const r = await generateEmailSequence({
        email_list_id: Number(seqForm.email_list_id), objective: seqForm.objective,
        tone: seqForm.tone, language: seqForm.language, dates,
      })
      setSeqGenerated(r.emails)
    } catch (e) { setSeqError(e.response?.data?.detail || t('emailMarketing.sequences.errorGenerating')) }
    finally { setSeqGenerating(false) }
  }

  const updateGeneratedEmail = (i, field, value) =>
    setSeqGenerated(p => p.map((e, idx) => idx === i ? { ...e, [field]: value } : e))

  const handleConfirmSequence = async () => {
    if (!seqForm.name || !seqGenerated?.length) return
    setSeqCreating(true); setSeqError(null)
    try {
      await createEmailSequence({
        name: seqForm.name, email_list_id: Number(seqForm.email_list_id),
        objective: seqForm.objective, tone: seqForm.tone, language: seqForm.language,
        emails: seqGenerated,
      })
      setSeqGenerated(null); setSeqForm({ name: '', email_list_id: '', objective: '', tone: 'Profesional', language: 'Español' }); setSeqDates([''])
      loadSequences()
    } catch (e) { setSeqError(e.response?.data?.detail || t('emailMarketing.sequences.errorScheduling')) }
    finally { setSeqCreating(false) }
  }

  const handleCancelSequence = async (id) => {
    if (!confirm(t('emailMarketing.sequences.confirmCancelSequence'))) return
    await deleteEmailSequence(id)
    loadSequences()
  }

  const handleUpdateSequenceStep = async (seqId, jobId, field, value) => {
    await updateSequenceStep(seqId, jobId, { [field]: value })
    loadSequences()
  }

  const editingData = editingTmpl ? getTmpl(editingTmpl) : null
  const editingMeta = editingTmpl ? allTemplates.find(t => t.key === editingTmpl) : null

  const totalListContacts = emailLists.reduce((s, l) => s + l.with_email, 0)

  return (
    <div className="p-6 space-y-3 max-w-2xl">

      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
          <EnvelopeIcon className="w-6 h-6 text-z-blue-light" /> {t('emailMarketing.title')}
        </h1>
        <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${cfg.sendgrid_configured ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {cfg.sendgrid_configured ? t('emailMarketing.statusActive') : t('emailMarketing.statusNotConfigured')}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-z-border mb-1">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-z-blue-light border-z-blue-light'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── TAB: CONTACTOS ── */}
      {activeTab === 'contactos' && (<>

      {/* ── 1. LISTAS DE EMAIL ── */}
      <Section id="listas" label={t('emailMarketing.lists.title')} icon={ListBulletIcon}
        badge={emailLists.length > 0 ? t('emailMarketing.lists.badgeCount', { count: emailLists.length, plural: emailLists.length !== 1 ? 's' : '', contacts: totalListContacts }) : undefined}
        openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            {t('emailMarketing.lists.intro')}
          </p>

          {/* New list button / input */}
          {showNewListInput ? (
            <div className="flex gap-2">
              <input
                autoFocus
                type="text" value={newListName}
                onChange={e => setNewListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateList(); if (e.key === 'Escape') { setShowNewListInput(false); setNewListName('') } }}
                placeholder={t('emailMarketing.lists.namePlaceholder')}
                className="z-input-light text-sm flex-1" />
              <button onClick={handleCreateList} disabled={!newListName.trim() || creatingList}
                className="z-btn-primary text-xs disabled:opacity-50 whitespace-nowrap">
                {creatingList ? t('emailMarketing.lists.creating') : t('emailMarketing.lists.create')}
              </button>
              <button onClick={() => { setShowNewListInput(false); setNewListName('') }}
                className="z-btn-ghost text-xs">{t('emailMarketing.lists.cancel')}</button>
            </div>
          ) : (
            <button onClick={() => setShowNewListInput(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors">
              <PlusIcon className="w-3.5 h-3.5" /> {t('emailMarketing.lists.newList')}
            </button>
          )}

          {/* Lists */}
          {emailLists.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-4">{t('emailMarketing.lists.noLists')}</p>
          ) : (
            <div className="space-y-2">
              {emailLists.map(list => (
                <div key={list.id} className="rounded-xl border border-z-border overflow-hidden">
                  {/* List header row */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white/3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ListBulletIcon className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <div className="min-w-0">
                        {renamingListId === list.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text" autoFocus value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') handleSaveRenameList(list.id)
                                if (e.key === 'Escape') cancelRenameList()
                              }}
                              className="z-input text-sm py-1 px-2 h-7 w-48"
                            />
                            <button
                              onClick={() => handleSaveRenameList(list.id)}
                              disabled={savingRename || !renameValue.trim()}
                              className="p-1 text-green-400 hover:text-green-300 disabled:opacity-40 transition-colors">
                              <CheckIcon className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelRenameList}
                              className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 group">
                            <p className="text-sm font-semibold text-slate-200 truncate">{list.name}</p>
                            <button
                              onClick={() => startRenameList(list)}
                              className="p-0.5 text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
                              title={t('emailMarketing.lists.renameBtn')}>
                              <PencilSquareIcon className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        <p className="text-xs text-slate-500">
                          {t('emailMarketing.lists.totalWithEmail', { total: list.total, withEmail: list.with_email })}
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
                        <PlusIcon className="w-3 h-3" /> {t('emailMarketing.lists.csvBtn')}
                      </button>
                      <button
                        onClick={() => setAddContactForm(p => p.listId === list.id
                          ? { listId: null, name: '', email: '', company: '', saving: false, error: '' }
                          : { listId: list.id, name: '', email: '', company: '', saving: false, error: '' }
                        )}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${addContactForm.listId === list.id ? 'text-slate-200 border-slate-400/40 bg-white/10' : 'text-blue-400 border-blue-400/30 hover:bg-blue-400/10'}`}>
                        <PlusIcon className="w-3 h-3" /> {t('emailMarketing.lists.manualBtn')}
                      </button>
                      <button
                        onClick={() => handleViewContacts(list.id)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded-lg transition-colors ${listContacts.id === list.id ? 'text-slate-200 border-slate-400/40 bg-white/10' : 'text-slate-400 border-z-border hover:bg-white/5'}`}>
                        <EyeIcon className="w-3 h-3" />
                        {listContacts.id === list.id ? t('emailMarketing.lists.hide') : t('emailMarketing.lists.view')}
                      </button>
                      <button
                        onClick={() => handleDownloadList(list)}
                        disabled={downloadingListId === list.id || !list.total}
                        title={t('emailMarketing.lists.downloadBtn')}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40">
                        <ArrowDownTrayIcon className="w-3 h-3" /> {t('emailMarketing.lists.downloadBtn')}
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
                      <p className="text-xs font-medium text-slate-400">{t('emailMarketing.lists.addManualTitle')}</p>
                      <div className="grid grid-cols-3 gap-2">
                        <input
                          type="text" placeholder={t('emailMarketing.lists.namePh')} value={addContactForm.name}
                          onChange={e => setAddContactForm(p => ({ ...p, name: e.target.value }))}
                          className="z-input-light text-xs" />
                        <input
                          type="email" placeholder={t('emailMarketing.lists.emailPh')} value={addContactForm.email}
                          onChange={e => setAddContactForm(p => ({ ...p, email: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && handleAddContact()}
                          className="z-input-light text-xs" />
                        <input
                          type="text" placeholder={t('emailMarketing.lists.companyPh')} value={addContactForm.company}
                          onChange={e => setAddContactForm(p => ({ ...p, company: e.target.value }))}
                          className="z-input-light text-xs" />
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handleAddContact} disabled={!addContactForm.email.trim() || addContactForm.saving}
                          className="z-btn-primary text-xs disabled:opacity-50">
                          {addContactForm.saving ? t('emailMarketing.lists.saving') : t('emailMarketing.lists.add')}
                        </button>
                        <button onClick={() => setAddContactForm({ listId: null, name: '', email: '', company: '', saving: false, error: '' })}
                          className="z-btn-ghost text-xs">{t('emailMarketing.lists.cancel')}</button>
                        {addContactForm.error && <p className="text-xs text-red-400">{addContactForm.error}</p>}
                      </div>
                    </div>
                  )}

                  {/* Contacts panel */}
                  {listContacts.id === list.id && (
                    <div className="border-t border-z-border">
                      {listContacts.loading ? (
                        <p className="text-center text-slate-500 text-sm py-6 animate-pulse">{t('emailMarketing.lists.loadingContacts')}</p>
                      ) : listContacts.contacts.length === 0 ? (
                        <p className="text-center text-slate-600 text-sm py-6">{t('emailMarketing.lists.noContacts')}</p>
                      ) : (
                        <div>
                          <div className="px-3 py-2 border-b border-z-border flex gap-2">
                            <input
                              type="text"
                              placeholder={t('emailMarketing.lists.searchPlaceholder')}
                              value={contactSearch}
                              onChange={e => setContactSearch(e.target.value)}
                              className="flex-1 bg-black/30 border border-z-border rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-z-blue"
                            />
                            <select
                              value={contactLabelFilter}
                              onChange={e => setContactLabelFilter(e.target.value)}
                              className="bg-black/30 border border-z-border rounded px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-z-blue cursor-pointer"
                              title={t('emailMarketing.lists.filterTitle')}
                            >
                              <option value="all">{t('emailMarketing.lists.filterAll')}</option>
                              {LABEL_OPTIONS.map(o => (
                                <option key={o.value || 'none'} value={o.value || 'none'}>{o.label}</option>
                              ))}
                            </select>
                          </div>
                        <div className="overflow-x-auto max-h-72 overflow-y-auto">
                          <table className="w-full text-xs min-w-[480px]">
                            <thead className="bg-black/20 sticky top-0">
                              <tr>
                                {[t('emailMarketing.lists.headers.name'), t('emailMarketing.lists.headers.email'), t('emailMarketing.lists.headers.status'), t('emailMarketing.lists.headers.company'), ''].map(h => (
                                  <th key={h} className="px-3 py-2 text-left font-medium text-slate-500 uppercase">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-z-border">
                              {listContacts.contacts.filter(c => {
                                if (contactLabelFilter !== 'all') {
                                  const labelKey = c.email_label || 'none'
                                  if (labelKey !== contactLabelFilter) return false
                                }
                                if (!contactSearch.trim()) return true
                                const q = contactSearch.toLowerCase()
                                return (c.name || '').toLowerCase().includes(q) ||
                                  (c.email || '').toLowerCase().includes(q) ||
                                  (c.company || '').toLowerCase().includes(q)
                              }).map(c => (
                                <tr key={c.id} className="hover:bg-white/[0.02]">
                                  {editingContactId === c.id ? (
                                    <>
                                      <td className="px-3 py-2">
                                        <input
                                          type="text" value={editContactForm.name} autoFocus
                                          onChange={e => setEditContactForm(p => ({ ...p, name: e.target.value }))}
                                          className="w-full bg-black/30 border border-z-blue rounded px-1.5 py-1 text-xs text-slate-200 focus:outline-none"
                                        />
                                      </td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="email" value={editContactForm.email}
                                          onChange={e => setEditContactForm(p => ({ ...p, email: e.target.value }))}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveEditContact(list.id, c.id)
                                            if (e.key === 'Escape') cancelEditContact()
                                          }}
                                          className="w-full bg-black/30 border border-z-blue rounded px-1.5 py-1 text-xs font-mono text-slate-200 focus:outline-none"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-slate-600">—</td>
                                      <td className="px-3 py-2">
                                        <input
                                          type="text" value={editContactForm.company}
                                          onChange={e => setEditContactForm(p => ({ ...p, company: e.target.value }))}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') handleSaveEditContact(list.id, c.id)
                                            if (e.key === 'Escape') cancelEditContact()
                                          }}
                                          className="w-full bg-black/30 border border-z-blue rounded px-1.5 py-1 text-xs text-slate-200 focus:outline-none"
                                        />
                                      </td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            onClick={() => handleSaveEditContact(list.id, c.id)}
                                            disabled={savingEditContact}
                                            className="p-1 text-green-400 hover:text-green-300 disabled:opacity-40 transition-colors"
                                          >
                                            <CheckIcon className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={cancelEditContact}
                                            className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                                          >
                                            <XMarkIcon className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  ) : (
                                    <>
                                      <td className="px-3 py-2 text-slate-200 font-medium max-w-[120px] truncate">{c.name || '—'}</td>
                                      <td className="px-3 py-2 font-mono text-slate-300 max-w-[160px] truncate">
                                        {c.unsubscribed
                                          ? <span className="text-red-400">{c.email} <span className="text-xs">{t('emailMarketing.lists.unsubscribedTag')}</span></span>
                                          : c.email || <span className="text-slate-600 italic">{t('emailMarketing.lists.noEmail')}</span>}
                                      </td>
                                      <td className="px-3 py-2">
                                        {/* Classification dropdown */}
                                        <select
                                          value={c.email_label || ''}
                                          onChange={e => handleLabelContact(c.id, e.target.value || null)}
                                          className={`text-xs rounded px-2 py-1 border-0 outline-none cursor-pointer ${getLabelMeta(c.email_label || null).bg} ${getLabelMeta(c.email_label || null).color}`}
                                          title={t('emailMarketing.lists.classifyTitle')}
                                        >
                                          {LABEL_OPTIONS.map(o => (
                                            <option key={o.value || ''} value={o.value || ''}>{o.label}</option>
                                          ))}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2 text-slate-500 max-w-[100px] truncate">{c.company || '—'}</td>
                                      <td className="px-3 py-2 text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <button
                                            onClick={() => startEditContact(c)}
                                            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-white/5 rounded transition-colors"
                                            title={t('emailMarketing.lists.editContactTitle')}
                                          >
                                            <PencilSquareIcon className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteContact(list.id, c.id, c.email)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded transition-colors"
                                            title={t('emailMarketing.lists.removeTitle')}
                                          >
                                            <TrashIcon className="w-3.5 h-3.5" />
                                            {t('emailMarketing.lists.removeBtn')}
                                          </button>
                                          <button
                                            onClick={() => handleUnsubscribeAndDelete(list.id, c.id)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs text-amber-500 hover:text-amber-300 hover:bg-amber-500/10 rounded transition-colors"
                                            title={t('emailMarketing.lists.blockTitle')}
                                          >
                                            <UserMinusIcon className="w-3.5 h-3.5" />
                                            {t('emailMarketing.lists.blockBtn')}
                                          </button>
                                        </div>
                                      </td>
                                    </>
                                  )}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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

      </>)}

      {/* ── TAB: ENVIAR ── */}
      {activeTab === 'enviar' && (<>

      {/* ── 2. ENVÍO MASIVO ── */}
      <Section id="envio" label={t('emailMarketing.bulk.title')} icon={PaperAirplaneIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">{t('emailMarketing.bulk.intro')}</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.bulk.recipients')}</label>
              <select value={bulkCampaign} onChange={e => { setBulkCampaign(e.target.value); setConfirmStep(false); setBulkResult(null) }}
                className="z-input-light text-sm">
                <option value="">{t('emailMarketing.bulk.allOption')}</option>
                {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="email_only">
                  {t('emailMarketing.bulk.emailContactsOption', { count: emailContactsCount ? `(${emailContactsCount.with_email})` : '' })}
                </option>
                {emailLists.length > 0 && (
                  <optgroup label={t('emailMarketing.bulk.listsGroup')}>
                    {emailLists.map(l => (
                      <option key={`list:${l.id}`} value={`list:${l.id}`}>
                        {t('emailMarketing.bulk.listOption', { name: l.name, count: l.with_email })}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.bulk.template')}</label>
              <select value={bulkTmpl} onChange={e => { setBulkTmpl(e.target.value); setConfirmStep(false); setBulkResult(null) }}
                className="z-input-light text-sm">
                {allTemplates.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
              </select>
            </div>
          </div>

          {/* Batch size */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-z-border">
            <div className="flex-1">
              <p className="text-xs font-medium text-slate-300">{t('emailMarketing.bulk.batchTitle')}</p>
              <p className="text-xs text-slate-500 mt-0.5">{t('emailMarketing.bulk.batchHint')}</p>
            </div>
            <select value={bulkBatchSize} onChange={e => { setBulkBatchSize(e.target.value); setConfirmStep(false); setBulkResult(null) }}
              className="z-input-light text-sm w-36 flex-shrink-0">
              <option value="">{t('emailMarketing.bulk.noLimit')}</option>
              <option value="50">{t('emailMarketing.bulk.perBatch', { n: 50 })}</option>
              <option value="100">{t('emailMarketing.bulk.perBatch', { n: 100 })}</option>
              <option value="200">{t('emailMarketing.bulk.perBatch', { n: 200 })}</option>
              <option value="500">{t('emailMarketing.bulk.perBatch', { n: 500 })}</option>
              <option value="1000">{t('emailMarketing.bulk.perBatch', { n: 1000 })}</option>
            </select>
          </div>

          {(() => {
            const subj = cfg.email_templates[bulkTmpl]?.subject
            const body = cfg.email_templates[bulkTmpl]?.body
            return (
              <>
                {subj
                  ? <p className="text-xs text-slate-400">{t('emailMarketing.bulk.subjectLabel')} <span className="text-slate-300 italic">"{subj}"</span></p>
                  : <p className="text-xs text-amber-400">{t('emailMarketing.bulk.noSubjectWarning')}</p>}
                {!body?.trim() && (
                  <p className="text-xs text-amber-400">{t('emailMarketing.bulk.noBodyWarning')}</p>
                )}
              </>
            )
          })()}

          {!cfg.sendgrid_configured && (
            <p className="text-xs text-amber-400 bg-amber-400/5 border border-amber-400/20 rounded-lg px-3 py-2">
              {t('emailMarketing.bulk.sendgridWarning')}
            </p>
          )}

          {!confirmStep && !bulkResult && (
            <button onClick={prepareSend} disabled={!cfg.sendgrid_configured} className="z-btn-primary w-full disabled:opacity-40">
              {t('emailMarketing.bulk.prepareSend')}
            </button>
          )}

          {confirmStep && !bulkLoading && (
            <div className="rounded-xl border border-z-border bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-z-border">
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">{t('emailMarketing.bulk.summaryTitle')}</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('emailMarketing.bulk.recipientsLabel')}</span>
                  <span className="text-slate-200 font-medium">
                    {bulkCampaign.startsWith('list:')
                      ? emailLists.find(l => l.id === Number(bulkCampaign.slice(5)))?.name || t('emailMarketing.bulk.listFallback')
                      : bulkCampaign === 'email_only'
                        ? t('emailMarketing.bulk.emailContactsWithCount', { count: emailContactsCount?.with_email ?? '…' })
                        : bulkCampaign
                          ? campaigns.find(c => String(c.id) === bulkCampaign)?.name || t('emailMarketing.bulk.campaignFallback')
                          : t('emailMarketing.bulk.recipientsAllFallback')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('emailMarketing.bulk.templateLabel')}</span>
                  <span className="text-slate-200 font-medium">{allTemplates.find(tp => tp.key === bulkTmpl)?.label}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">{t('emailMarketing.bulk.senderLabel')}</span>
                  <span className="text-slate-200">{cfg.email_from_name || '—'} &lt;{cfg.email_from || '—'}&gt;</span>
                </div>
                {recipientLoading && <div className="pt-1 text-xs text-slate-500 animate-pulse">{t('emailMarketing.bulk.calculatingRecipients')}</div>}
                {!recipientLoading && recipientStats && (
                  <div className="pt-1 border-t border-z-border mt-2 space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-400">
                        {bulkBatchSize ? t('emailMarketing.bulk.thisBatchOf', { total: recipientStats.will_receive }) : t('emailMarketing.bulk.willReceive')}
                      </span>
                      <span className="text-green-400 font-bold">
                        {bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive}
                      </span>
                    </div>
                    {bulkBatchSize && recipientStats.will_receive > recipientStats.will_receive_this_batch && (
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>{t('emailMarketing.bulk.pendingNextBatches')}</span>
                        <span>{recipientStats.will_receive - recipientStats.will_receive_this_batch}</span>
                      </div>
                    )}
                    {recipientStats.without_email > 0 && (
                      <div className="flex justify-between text-xs text-slate-500"><span>{t('emailMarketing.bulk.withoutEmail')}</span><span>{recipientStats.without_email}</span></div>
                    )}
                    {recipientStats.unsubscribed > 0 && (
                      <div className="flex justify-between text-xs text-slate-500"><span>{t('emailMarketing.bulk.unsubscribed')}</span><span>{recipientStats.unsubscribed}</span></div>
                    )}
                    {recipientStats.labeled > 0 && (
                      <div className="flex justify-between text-xs text-slate-500"><span>{t('emailMarketing.bulk.labeledExcluded')}</span><span>{recipientStats.labeled}</span></div>
                    )}
                    {(bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive) === 0 && <p className="text-xs text-amber-400">{t('emailMarketing.bulk.noValidRecipients')}</p>}
                    <button onClick={loadRecipientDetail} disabled={recipientDetailLoading}
                      className="mt-2 w-full text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-400/50 rounded-lg py-1.5 transition-colors disabled:opacity-50">
                      {recipientDetailLoading ? t('emailMarketing.bulk.loading') : t('emailMarketing.bulk.viewFullList')}
                    </button>
                  </div>
                )}
              </div>
              {/* Schedule toggle */}
              <div className="px-4 pb-3 border-t border-z-border pt-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" checked={scheduleMode} onChange={e => { setScheduleMode(e.target.checked); if (!e.target.checked) setScheduleAt('') }}
                    className="w-4 h-4 rounded accent-blue-500" />
                  <span className="text-sm text-slate-300">{t('emailMarketing.bulk.scheduleLater')}</span>
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
                <button onClick={sendBulk} disabled={bulkLoading || (bulkBatchSize ? recipientStats?.will_receive_this_batch : recipientStats?.will_receive) === 0 || (scheduleMode && !scheduleAt)}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
                  {scheduleMode && scheduleAt
                    ? t('emailMarketing.bulk.scheduleFor', { date: displayUTC5(fromUTC5ToISO(scheduleAt), dateLocale) })
                    : (recipientStats ? t('emailMarketing.bulk.confirmSendCount', { count: bulkBatchSize ? recipientStats.will_receive_this_batch : recipientStats.will_receive }) : t('emailMarketing.bulk.confirmSend'))}
                </button>
                <button onClick={() => { setConfirmStep(false); setScheduleMode(false); setScheduleAt('') }}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                  {t('emailMarketing.bulk.cancel')}
                </button>
              </div>
            </div>
          )}

          {/* ── Live progress panel ── */}
          {(bulkLoading || bulkJobProgress) && (
            <div className="rounded-xl border border-z-border bg-white/5 overflow-hidden">
              <div className="px-4 py-3 border-b border-z-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {bulkLoading && bulkJobProgress?.status !== 'paused' && (
                    <svg className="animate-spin w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                  )}
                  {!bulkLoading && bulkJobProgress?.status === 'done' && (
                    <CheckCircleIcon className="w-4 h-4 text-green-400 flex-shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    {bulkJobProgress?.status === 'paused'
                      ? t('emailMarketing.bulk.pausedStatus')
                      : bulkLoading
                        ? (batchNumber > 1 ? t('emailMarketing.bulk.sendingBatch', { n: batchNumber }) : t('emailMarketing.bulk.sendingInProgress'))
                        : t('emailMarketing.bulk.batchCompleted', { n: batchNumber })}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {bulkJobId && bulkJobProgress && (bulkJobProgress.status === 'running' || bulkJobProgress.status === 'paused') && (
                    <>
                      <button
                        onClick={togglePauseBulk}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                          bulkJobProgress.status === 'paused'
                            ? 'text-green-400 border-green-500/30 hover:bg-green-500/10'
                            : 'text-amber-400 border-amber-500/30 hover:bg-amber-500/10'
                        }`}
                      >
                        {bulkJobProgress.status === 'paused' ? t('emailMarketing.bulk.resume') : t('emailMarketing.bulk.pause')}
                      </button>
                      <button
                        onClick={cancelBulk}
                        className="text-xs px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        {t('emailMarketing.bulk.cancelBtn')}
                      </button>
                    </>
                  )}
                  {bulkJobProgress && (
                    <span className="text-sm font-bold text-green-400">
                      {t('emailMarketing.bulk.sentOf', { sent: bulkJobProgress.sent, total: bulkJobProgress.total })}
                    </span>
                  )}
                </div>
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
                      <span>{t('emailMarketing.bulk.sentCount', { count: bulkJobProgress.sent })}</span>
                      {bulkJobProgress.skipped > 0 && <span className="text-red-400">{t('emailMarketing.bulk.failedCount', { count: bulkJobProgress.skipped })}</span>}
                      <span>{t('emailMarketing.bulk.pendingCount', { count: bulkJobProgress.total - bulkJobProgress.sent - bulkJobProgress.skipped })}</span>
                    </div>
                  </div>

                  {/* Sent emails list */}
                  {bulkJobProgress.sent_list?.length > 0 && (
                    <div className="px-4 pb-2">
                      <p className="text-xs text-slate-500 mb-1 mt-2">{t('emailMarketing.bulk.sentList')}</p>
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
                      <p className="text-xs text-red-400 mb-1 mt-2">{t('emailMarketing.bulk.failedList')}</p>
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
                <div className="px-4 py-3 border-t border-z-border flex items-center gap-4 flex-wrap">
                  {bulkBatchSize && recipientStats?.will_receive_this_batch > 0 && (
                    <button onClick={sendNextBatch}
                      className="px-4 py-1.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                      {t('emailMarketing.bulk.nextBatch', { count: recipientStats.will_receive_this_batch })}
                    </button>
                  )}
                  <button onClick={() => { setBulkJobProgress(null); setBulkJobId(null); setBatchNumber(1) }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors">{t('emailMarketing.bulk.newSend')}</button>
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
                    {bulkResult.error ? t('emailMarketing.bulk.errorSending') : bulkResult.scheduled ? t('emailMarketing.bulk.scheduledSuccess') : t('emailMarketing.bulk.emailsSentSuccess', { plural: bulkResult.sent !== 1 ? 's' : '' })}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {bulkResult.error ? bulkResult.error
                      : bulkResult.scheduled ? t('emailMarketing.bulk.willSendOn', { date: displayUTC5(bulkResult.scheduled_at, dateLocale) })
                      : bulkResult.skipped ? t('emailMarketing.bulk.someSkipped', { count: bulkResult.skipped }) : t('emailMarketing.bulk.allDelivered')}
                  </p>
                </div>
              </div>
              <div className="px-5 py-3 border-t border-white/5">
                <button onClick={() => { setBulkResult(null); setErrorsOpen(false) }}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors">{t('emailMarketing.bulk.newSend')}</button>
              </div>
            </div>
          )}
        </div>
      </Section>

      </>)}

      {/* ── TAB: PLANTILLAS ── */}
      {activeTab === 'plantillas' && (<>

      {/* ── 3. PLANTILLAS PROFESIONALES ── */}
      <Section id="plantillas-pro" label={t('emailMarketing.pro.title')} icon={SparklesIcon} openSections={openSections} toggle={toggle}>
        <div className="divide-y divide-z-border">
          <p className="px-5 py-3 text-xs text-slate-500">{t('emailMarketing.pro.intro')}</p>
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
                      <p className="text-xs text-slate-500 truncate">{pro.subject.replace(/{{empresa}}/g, t('emailMarketing.pro.companyPlaceholder'))}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setPreviewProKey(isOpen ? null : key)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 border border-z-border rounded-lg hover:bg-white/5 transition-colors">
                      <EyeIcon className="w-3.5 h-3.5" /> {isOpen ? t('emailMarketing.pro.close') : t('emailMarketing.pro.view')}
                    </button>
                    <button onClick={() => { loadProTemplate(key); setEditingTmpl(key); setPreviewOpen(false); toggle('mis-plantillas'); setTimeout(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80) }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors font-medium">
                      <SparklesIcon className="w-3.5 h-3.5" /> {t('emailMarketing.pro.use')}
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <div className="rounded-lg overflow-hidden border border-gray-200 bg-white"
                    dangerouslySetInnerHTML={{ __html: buildHtml({ ...pro, greeting: pro.greeting.replace(/{{nombre}}/g, 'Carlos'), body: pro.body.replace(/{{nombre}}/g, 'Carlos').replace(/{{empresa}}/g, 'Empresa ABC').replace(/{{agente}}/g, 'Isabella'), signature: pro.signature.replace(/{{agente}}/g, 'Isabella') }, buildHtmlLabels) }} />
                )}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ── 4. MIS PLANTILLAS ── */}
      <Section id="mis-plantillas" label={t('emailMarketing.myTemplates.title')} icon={PencilSquareIcon} openSections={openSections} toggle={toggle}>
        <div>
          {/* New template input */}
          <div className="px-5 py-3 border-b border-z-border flex items-center justify-between">
            <p className="text-xs text-slate-500">{t('emailMarketing.myTemplates.intro')}</p>
            <button onClick={() => setShowNewInput(p => !p)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-400 border border-blue-400/30 rounded-lg hover:bg-blue-400/10 transition-colors ml-3 flex-shrink-0">
              <PlusIcon className="w-3.5 h-3.5" /> {t('emailMarketing.myTemplates.new')}
            </button>
          </div>
          {showNewInput && (
            <div className="px-5 py-3 border-b border-z-border bg-white/5 flex gap-2">
              <input autoFocus type="text" value={newTmplName}
                onChange={e => setNewTmplName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createTemplate(); if (e.key === 'Escape') { setShowNewInput(false); setNewTmplName('') } }}
                placeholder={t('emailMarketing.myTemplates.namePlaceholder')} className="z-input-light text-sm flex-1" />
              <button onClick={createTemplate} disabled={!newTmplName.trim()} className="z-btn-primary text-xs disabled:opacity-50 whitespace-nowrap">{t('emailMarketing.myTemplates.create')}</button>
              <button onClick={() => { setShowNewInput(false); setNewTmplName('') }} className="z-btn-ghost text-xs">{t('emailMarketing.myTemplates.cancel')}</button>
            </div>
          )}
          <div className="divide-y divide-z-border">
            <div className="px-4 py-2 bg-white/3">
              <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">{t('emailMarketing.myTemplates.autoSection')}</p>
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
                    {filled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{t('emailMarketing.myTemplates.configured')}</span>}
                    <PencilSquareIcon className="w-4 h-4 text-slate-500" />
                  </div>
                </div>
              )
            })}
            {customTemplates.length > 0 && (
              <>
                <div className="px-4 py-2 bg-white/3">
                  <p className="text-xs text-slate-600 uppercase tracking-wide font-medium">{t('emailMarketing.myTemplates.customSection')}</p>
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
                          <p className="text-xs text-slate-500 truncate">{filled && subject ? subject : t('emailMarketing.myTemplates.customDesc')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-3" onClick={e => e.stopPropagation()}>
                        {filled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">{t('emailMarketing.myTemplates.configured')}</span>}
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
                      {t('emailMarketing.myTemplates.editingLabel')} <span className="text-blue-400">{editingMeta?.label}</span>
                    </h2>
                  )}
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t('emailMarketing.myTemplates.variablesLabel')} <span className="font-mono text-blue-400">{'{{nombre}}  {{empresa}}  {{telefono}}  {{fecha}}  {{agente}}'}</span>
                  </p>
                </div>
                <button onClick={() => loadProTemplate(editingTmpl)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-400 border border-amber-400/30 rounded-lg hover:bg-amber-400/10 transition-colors">
                  <SparklesIcon className="w-3.5 h-3.5" /> {t('emailMarketing.myTemplates.proTemplateBtn')}
                </button>
              </div>
              <p className="px-5 pt-3 text-xs text-amber-400/80 bg-amber-400/5">
                {t('emailMarketing.myTemplates.unsavedWarning')}
              </p>
              <div className="p-5 space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.subjectLabel')}</label>
                  <input type="text" value={editingData.subject}
                    onChange={e => setTmplField(editingTmpl, 'subject', e.target.value)}
                    placeholder={`${t('emailMarketing.myTemplates.subjectPlaceholderPrefix')}{{empresa}}`} className="z-input-light text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.greetingLabel')}</label>
                  <input type="text" value={editingData.greeting}
                    onChange={e => setTmplField(editingTmpl, 'greeting', e.target.value)}
                    placeholder={`${t('emailMarketing.myTemplates.greetingPlaceholderPrefix')}{{nombre}}${t('emailMarketing.myTemplates.greetingPlaceholderSuffix')}`} className="z-input-light text-sm" />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.bodyLabel')}</label>
                  <textarea rows={6} value={editingData.body}
                    onChange={e => setTmplField(editingTmpl, 'body', e.target.value)}
                    placeholder={t('emailMarketing.myTemplates.bodyPlaceholder')} className="z-input-light text-sm resize-none" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.cta1TextLabel')}</label>
                    <input type="text" value={editingData.cta_text}
                      onChange={e => setTmplField(editingTmpl, 'cta_text', e.target.value)}
                      placeholder={t('emailMarketing.myTemplates.cta1TextPlaceholder')} className="z-input-light text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.cta1UrlLabel')}</label>
                    <input type="url" value={editingData.cta_url}
                      onChange={e => setTmplField(editingTmpl, 'cta_url', e.target.value)}
                      placeholder="https://calendly.com/..." className="z-input-light text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.cta2TextLabel')}</label>
                    <input type="text" value={editingData.cta_text_2 || ''}
                      onChange={e => setTmplField(editingTmpl, 'cta_text_2', e.target.value)}
                      placeholder={t('emailMarketing.myTemplates.cta2TextPlaceholder')} className="z-input-light text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.cta2UrlLabel')}</label>
                    <input type="url" value={editingData.cta_url_2 || ''}
                      onChange={e => setTmplField(editingTmpl, 'cta_url_2', e.target.value)}
                      placeholder="https://ejemplo.com/..." className="z-input-light text-sm" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.myTemplates.signatureLabel')}</label>
                  <textarea rows={2} value={editingData.signature}
                    onChange={e => setTmplField(editingTmpl, 'signature', e.target.value)}
                    placeholder={`${t('emailMarketing.myTemplates.signaturePlaceholderPrefix')}{{agente}}`} className="z-input-light text-sm resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                      <PaperClipIcon className="w-3.5 h-3.5" /> {t('emailMarketing.myTemplates.attachmentLabel')}
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <input ref={tmplAttachRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadTmplAttach(e, 1)} />
                      <button onClick={() => tmplAttachRef.current?.click()} disabled={tmplAttachLoading}
                        className="z-btn-ghost border border-z-border text-xs disabled:opacity-50">
                        {tmplAttachLoading ? t('emailMarketing.myTemplates.uploading') : cfg.email_templates[editingTmpl]?.attachment_name ? t('emailMarketing.myTemplates.replaceAttachment') : t('emailMarketing.myTemplates.uploadAttachment')}
                      </button>
                      {cfg.email_templates[editingTmpl]?.attachment_name && (
                        <>
                          <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                            ✓ {cfg.email_templates[editingTmpl].attachment_name}
                          </span>
                          <button onClick={() => removeTmplAttach(1)} disabled={tmplAttachLoading}
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                            {t('emailMarketing.myTemplates.remove')}
                          </button>
                        </>
                      )}
                    </div>
                    {cfg.email_templates[editingTmpl]?.attachment_name && (
                      <p className="text-xs text-amber-400/80 mt-1">
                        {t('emailMarketing.myTemplates.attachmentOverrideWarning')}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                      <PaperClipIcon className="w-3.5 h-3.5" /> {t('emailMarketing.myTemplates.attachmentLabel2')}
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <input ref={tmplAttach2Ref} type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadTmplAttach(e, 2)} />
                      <button onClick={() => tmplAttach2Ref.current?.click()} disabled={tmplAttachLoading}
                        className="z-btn-ghost border border-z-border text-xs disabled:opacity-50">
                        {tmplAttachLoading ? t('emailMarketing.myTemplates.uploading') : cfg.email_templates[editingTmpl]?.attachment_name_2 ? t('emailMarketing.myTemplates.replaceAttachment') : t('emailMarketing.myTemplates.uploadAttachment')}
                      </button>
                      {cfg.email_templates[editingTmpl]?.attachment_name_2 && (
                        <>
                          <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                            ✓ {cfg.email_templates[editingTmpl].attachment_name_2}
                          </span>
                          <button onClick={() => removeTmplAttach(2)} disabled={tmplAttachLoading}
                            className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                            {t('emailMarketing.myTemplates.remove')}
                          </button>
                        </>
                      )}
                    </div>
                    {cfg.email_templates[editingTmpl]?.attachment_name_2 && (
                      <p className="text-xs text-amber-400/80 mt-1">
                        {t('emailMarketing.myTemplates.attachmentOverrideWarning')}
                      </p>
                    )}
                  </div>
                  {tmplAttachMsg && (
                    <p className={`text-xs sm:col-span-2 ${tmplAttachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                      {tmplAttachMsg.ok ? `✓ ${tmplAttachMsg.text}` : tmplAttachMsg.text}
                    </p>
                  )}
                </div>
                <button onClick={() => setPreviewOpen(p => !p)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
                  <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${previewOpen ? 'rotate-180' : ''}`} />
                  {previewOpen ? t('emailMarketing.myTemplates.hidePreview') : t('emailMarketing.myTemplates.showPreview')}
                </button>
                {previewOpen && (
                  <div className="rounded-lg overflow-hidden border border-gray-200"
                    dangerouslySetInnerHTML={{ __html: buildHtml(editingData, buildHtmlLabels) }} />
                )}
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* ── Configuración automática (también visible aquí para no perderla de vista al editar plantillas) ── */}
      <Section id="config" label={t('emailMarketing.config.title')} icon={Cog6ToothIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.config.senderEmail')}</label>
              <input type="email" value={cfg.email_from} onChange={e => setCfg(p => ({ ...p, email_from: e.target.value }))}
                placeholder="info@empresa.com" className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.config.senderName')}</label>
              <input type="text" value={cfg.email_from_name} onChange={e => setCfg(p => ({ ...p, email_from_name: e.target.value }))}
                placeholder={t('emailMarketing.config.senderNamePlaceholder')} className="z-input-light text-sm" />
            </div>
          </div>
          <div className="border-t border-z-border pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                  <PaperClipIcon className="w-3.5 h-3.5" /> {t('emailMarketing.config.globalAttachmentLabel')}
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input ref={attachRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadAttach(e, 1)} />
                  <button onClick={() => attachRef.current?.click()} disabled={attachLoading}
                    className="z-btn-ghost border border-z-border text-xs disabled:opacity-50">
                    {attachLoading ? t('emailMarketing.myTemplates.uploading') : cfg.email_attachment_name ? t('emailMarketing.myTemplates.replaceAttachment') : t('emailMarketing.myTemplates.uploadAttachment')}
                  </button>
                  {cfg.email_attachment_name && (
                    <>
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                        ✓ {cfg.email_attachment_name}
                      </span>
                      <button onClick={() => removeAttach(1)} disabled={attachLoading}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                        {t('emailMarketing.myTemplates.remove')}
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1.5 flex items-center gap-1">
                  <PaperClipIcon className="w-3.5 h-3.5" /> {t('emailMarketing.config.globalAttachmentLabel2')}
                </label>
                <div className="flex items-center gap-3 flex-wrap">
                  <input ref={attach2Ref} type="file" accept=".pdf,image/*" className="hidden" onChange={e => uploadAttach(e, 2)} />
                  <button onClick={() => attach2Ref.current?.click()} disabled={attachLoading}
                    className="z-btn-ghost border border-z-border text-xs disabled:opacity-50">
                    {attachLoading ? t('emailMarketing.myTemplates.uploading') : cfg.email_attachment_2_name ? t('emailMarketing.myTemplates.replaceAttachment') : t('emailMarketing.myTemplates.uploadAttachment')}
                  </button>
                  {cfg.email_attachment_2_name && (
                    <>
                      <span className="text-xs font-mono text-slate-400 truncate max-w-[140px]">
                        ✓ {cfg.email_attachment_2_name}
                      </span>
                      <button onClick={() => removeAttach(2)} disabled={attachLoading}
                        className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50">
                        {t('emailMarketing.myTemplates.remove')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            {(cfg.email_attachment_name || cfg.email_attachment_2_name) && (
              <p className="text-xs text-slate-500 mt-2">
                {t('emailMarketing.config.globalAttachmentHint')}
              </p>
            )}
            {attachMsg && (
              <p className={`text-xs mt-1 ${attachMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                {attachMsg.ok ? `✓ ${attachMsg.text}` : attachMsg.text}
              </p>
            )}
          </div>
          <div className="border-t border-z-border pt-4">
            <label className="text-xs text-slate-400 mb-1.5 block">{t('emailMarketing.config.delayLabel')}</label>
            <select value={cfg.email_send_delay_ms} onChange={e => setCfg(p => ({ ...p, email_send_delay_ms: Number(e.target.value) }))}
              className="z-input-light text-sm w-full sm:w-auto">
              <option value={0}>{t('emailMarketing.config.delayNone')}</option>
              <option value={500}>{t('emailMarketing.config.delay500')}</option>
              <option value={1000}>{t('emailMarketing.config.delay1s')}</option>
              <option value={2000}>{t('emailMarketing.config.delay2s')}</option>
              <option value={5000}>{t('emailMarketing.config.delay5s')}</option>
            </select>
            <p className="text-xs text-slate-500 mt-1">{t('emailMarketing.config.delayHint')}</p>
          </div>
          <div className="border-t border-z-border pt-4 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t('emailMarketing.config.autoSectionTitle')}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <div onClick={() => setCfg(p => ({ ...p, email_enabled: !p.email_enabled }))}
                  className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${cfg.email_enabled ? 'bg-blue-500' : 'bg-slate-700'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.email_enabled ? 'translate-x-4' : ''}`} />
                </div>
                <span className="text-xs text-slate-400">{cfg.email_enabled ? t('emailMarketing.config.active') : t('emailMarketing.config.inactive')}</span>
              </label>
            </div>
            <p className="text-xs text-slate-500">{t('emailMarketing.config.autoSectionHint')}</p>
            {[
              { flag: 'email_send_on_interested',    label: t('emailMarketing.config.flagInterested') },
              { flag: 'email_send_on_callback',       label: t('emailMarketing.config.flagCallback') },
              { flag: 'email_send_on_voicemail',      label: t('emailMarketing.config.flagVoicemail') },
              { flag: 'email_send_on_not_interested', label: t('emailMarketing.config.flagNotInterested') },
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
              {saving ? t('emailMarketing.config.saving') : t('emailMarketing.config.save')}
            </button>
            {saved && <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircleIcon className="w-4 h-4" /> {t('emailMarketing.config.saved')}</span>}
          </div>
        </div>
      </Section>

      </>)}

      {/* ── TAB: ENVIAR (continuación) ── */}
      {activeTab === 'enviar' && (<>

      {/* ── 5. ENVÍO DE PRUEBA ── */}
      <Section id="prueba" label={t('emailMarketing.test.title')} icon={EnvelopeIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">{t('emailMarketing.test.intro')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.test.yourEmail')}</label>
              <input type="email" value={testAddr} onChange={e => setTestAddr(e.target.value)}
                placeholder="mi@correo.com" className="z-input-light text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">{t('emailMarketing.test.templateToTest')}</label>
              <select value={testTmpl} onChange={e => setTestTmpl(e.target.value)} className="z-input-light text-sm">
                {allTemplates.map(tp => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
              </select>
            </div>
          </div>
          {(() => {
            const subj = cfg.email_templates[testTmpl]?.subject
            return subj
              ? <p className="text-xs text-slate-400">{t('emailMarketing.test.subjectLabel')} <span className="italic">"{subj}"</span></p>
              : <p className="text-xs text-amber-400">{t('emailMarketing.test.noSubject')}</p>
          })()}
          <button onClick={sendTest} disabled={testLoading || !testAddr || !cfg.sendgrid_configured}
            className="z-btn-primary disabled:opacity-50">
            {testLoading ? t('emailMarketing.test.sending') : t('emailMarketing.test.send')}
          </button>
          {testMsg && (
            <p className={`text-xs ${testMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
              {testMsg.ok ? '✓' : '✗'} {testMsg.text}
            </p>
          )}
        </div>
      </Section>

      {/* ── Envíos programados ── */}
      {scheduledJobs.length > 0 && (
        <div className="bg-z-card rounded-xl border border-blue-500/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-z-border flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-blue-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">{t('emailMarketing.scheduled.title')}</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {t('emailMarketing.scheduled.pendingCount', { count: scheduledJobs.filter(j => j.status === 'pending').length })}
                {scheduledJobs.some(j => j.status === 'failed') && (
                  <span className="text-red-400"> · {t('emailMarketing.scheduled.failedCount', { count: scheduledJobs.filter(j => j.status === 'failed').length })}</span>
                )}
              </p>
            </div>
          </div>
          <div className="divide-y divide-z-border">
            {scheduledJobs.map(j => (
              <div key={j.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-slate-200 font-medium flex items-center gap-2">
                    {j.email_only ? t('emailMarketing.scheduled.emailContacts') : j.campaign_id ? t('emailMarketing.scheduled.campaignNum', { id: j.campaign_id }) : t('emailMarketing.scheduled.allProspects')}
                    <span className="text-xs text-slate-500 font-normal">{t('emailMarketing.scheduled.templateLabel', { key: j.template_key })}</span>
                    {j.status === 'failed' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">{t('emailMarketing.scheduled.failedBadge')}</span>
                    )}
                  </p>
                  <p className={`text-xs mt-0.5 ${j.status === 'failed' ? 'text-red-300' : 'text-blue-300'}`}>
                    {displayUTC5(j.scheduled_at, dateLocale)} <span className="text-slate-600">(UTC-5)</span>
                  </p>
                  {j.status === 'failed' && j.error && (
                    <p className="text-xs text-red-400/80 mt-0.5">{j.error}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setRescheduleModal({ id: j.id, scheduled_at: toUTC5Display(j.scheduled_at) })}
                    className="text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:bg-blue-500/10 px-3 py-1 rounded-lg transition-colors"
                  >
                    {j.status === 'failed' ? t('emailMarketing.scheduled.retry') : t('emailMarketing.scheduled.reschedule')}
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await cancelScheduledEmail(j.id)
                      } catch (e) {
                        alert(e.response?.data?.detail || t('emailMarketing.scheduled.errorCancel'))
                      }
                      loadScheduled()
                    }}
                    className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1 rounded-lg transition-colors"
                  >
                    {t('emailMarketing.scheduled.cancel')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Secuencias de correo (drip campaigns) ── */}
      <Section id="secuencias" label={t('emailMarketing.sequences.title')} icon={SparklesIcon}
        badge={sequences.length > 0 ? t('emailMarketing.sequences.badgeCount', { count: sequences.length, plural: sequences.length !== 1 ? 's' : '' }) : undefined}
        openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-5">
          <p className="text-xs text-slate-500">
            {t('emailMarketing.sequences.intro')}
          </p>

          {!seqGenerated && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input type="text" placeholder={t('emailMarketing.sequences.namePlaceholder')} value={seqForm.name}
                  onChange={e => setSeqForm(p => ({ ...p, name: e.target.value }))}
                  className="z-input-light text-sm" />
                <select value={seqForm.email_list_id}
                  onChange={e => setSeqForm(p => ({ ...p, email_list_id: e.target.value }))}
                  className="z-input-light text-sm">
                  <option value="">{t('emailMarketing.sequences.selectList')}</option>
                  {emailLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.with_email})</option>)}
                </select>
              </div>
              <textarea placeholder={t('emailMarketing.sequences.objectivePlaceholder')}
                value={seqForm.objective} onChange={e => setSeqForm(p => ({ ...p, objective: e.target.value }))}
                rows={2} className="z-input-light text-sm w-full" />
              <div className="grid grid-cols-2 gap-3">
                <select value={seqForm.tone} onChange={e => setSeqForm(p => ({ ...p, tone: e.target.value }))} className="z-input-light text-sm">
                  {['Profesional', 'Cercano', 'Persuasivo', 'Urgente'].map(tone =>
                    <option key={tone} value={tone}>{t(`emailMarketing.sequences.tones.${tone}`)}</option>)}
                </select>
                <select value={seqForm.language} onChange={e => setSeqForm(p => ({ ...p, language: e.target.value }))} className="z-input-light text-sm">
                  {['Español', 'Inglés', 'Spanglish'].map(l =>
                    <option key={l} value={l}>{t(`emailMarketing.sequences.languages.${l}`)}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-400">{t('emailMarketing.sequences.sendDatesLabel')}</label>
                {seqDates.map((d, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input type="date" value={d} onChange={e => updateSeqDate(i, e.target.value)} className="z-input-light text-sm" />
                    {seqDates.length > 1 && (
                      <button onClick={() => removeSeqDate(i)} className="text-red-400 hover:text-red-300">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addSeqDate} className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                  <PlusIcon className="w-3.5 h-3.5" /> {t('emailMarketing.sequences.addDate')}
                </button>
              </div>

              {seqError && <p className="text-xs text-red-400">{seqError}</p>}
              <button onClick={handleGenerateSequence} disabled={seqGenerating}
                className="z-btn-primary disabled:opacity-50 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4" /> {seqGenerating ? t('emailMarketing.sequences.generating') : t('emailMarketing.sequences.generate')}
              </button>
            </div>
          )}

          {seqGenerated && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">{t('emailMarketing.sequences.reviewHint')}</p>
              {seqGenerated.map((em, i) => (
                <div key={i} className="border border-z-border rounded-lg p-3 space-y-2">
                  <p className="text-xs text-blue-300">{t('emailMarketing.sequences.emailN', { n: i + 1 })} · {displayUTC5(em.date, dateLocale)} <span className="text-slate-600">(UTC-5)</span></p>
                  <input type="text" value={em.subject} onChange={e => updateGeneratedEmail(i, 'subject', e.target.value)}
                    className="z-input-light text-sm w-full" placeholder={t('emailMarketing.sequences.subjectPlaceholder')} />
                  <textarea value={em.body} onChange={e => updateGeneratedEmail(i, 'body', e.target.value)}
                    rows={4} className="z-input-light text-sm w-full" placeholder={t('emailMarketing.sequences.bodyPlaceholder')} />
                </div>
              ))}
              {seqError && <p className="text-xs text-red-400">{seqError}</p>}
              <div className="flex gap-2">
                <button onClick={handleConfirmSequence} disabled={seqCreating || !seqForm.name}
                  className="z-btn-primary disabled:opacity-50">
                  {seqCreating ? t('emailMarketing.sequences.scheduling') : t('emailMarketing.sequences.confirmAndSchedule')}
                </button>
                <button onClick={() => setSeqGenerated(null)} className="z-btn-ghost text-xs">{t('emailMarketing.sequences.discard')}</button>
              </div>
            </div>
          )}

          {sequences.length > 0 && (
            <div className="space-y-3 pt-3 border-t border-z-border">
              {sequences.map(seq => (
                <div key={seq.id} className="border border-z-border rounded-lg overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-white/5">
                    <div>
                      <p className="text-sm text-slate-200 font-medium">{seq.name}</p>
                      <p className="text-xs text-slate-500">{t('emailMarketing.sequences.emailsCount', { count: seq.steps.length, plural: seq.steps.length !== 1 ? 's' : '', status: seq.status })}</p>
                    </div>
                    {seq.status === 'scheduled' && (
                      <button onClick={() => handleCancelSequence(seq.id)}
                        className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 px-3 py-1 rounded-lg transition-colors">
                        {t('emailMarketing.sequences.cancelSequence')}
                      </button>
                    )}
                  </div>
                  <div className="divide-y divide-z-border">
                    {seq.steps.map(s => (
                      <div key={s.job_id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-300 truncate">{t('emailMarketing.sequences.stepLabel', { n: s.step, subject: s.subject })}</p>
                          <p className="text-xs text-slate-500">{displayUTC5(s.scheduled_at, dateLocale)} <span className="text-slate-600">(UTC-5)</span></p>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 ${
                          s.status === 'done' ? 'bg-green-500/15 text-green-400' :
                          s.status === 'failed' ? 'bg-red-500/15 text-red-400' :
                          s.status === 'cancelled' ? 'bg-slate-500/15 text-slate-400' :
                          'bg-blue-500/15 text-blue-400'
                        }`}>{s.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      </>)}

      {/* Modal reprogramar */}
      {rescheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-100">{t('emailMarketing.reschedule.title')}</h3>
            <div>
              <label className="text-xs text-slate-400 mb-1.5 block">{t('emailMarketing.reschedule.newDateTime')}</label>
              <input
                type="datetime-local"
                value={rescheduleModal.scheduled_at}
                onChange={e => setRescheduleModal(p => ({ ...p, scheduled_at: e.target.value }))}
                className="z-input w-full text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setRescheduleModal(null)} className="z-btn-ghost text-xs">{t('emailMarketing.reschedule.cancel')}</button>
              <button
                onClick={async () => {
                  try {
                    await rescheduleEmail(rescheduleModal.id, fromUTC5ToISO(rescheduleModal.scheduled_at))
                    setRescheduleModal(null)
                    loadScheduled()
                  } catch (e) { alert(e.response?.data?.detail || t('emailMarketing.reschedule.error')) }
                }}
                className="z-btn-primary text-xs"
              >
                {t('emailMarketing.reschedule.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: ANALÍTICA ── */}
      {activeTab === 'analitica' && (<>

      {/* ── 7. SEGUIMIENTO DE EMAILS ── */}
      <Section id="seguimiento" label={t('emailMarketing.analytics.trackingTitle')} icon={ChartBarIcon} openSections={openSections} toggle={toggle}>
        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500">
            {t('emailMarketing.analytics.trackingIntro')}
          </p>

          {!trackingEvents && (
            <button onClick={loadTrackingEvents} disabled={trackingLoading}
              className="z-btn-primary disabled:opacity-50">
              {trackingLoading ? t('emailMarketing.analytics.loading') : t('emailMarketing.analytics.loadEvents')}
            </button>
          )}

          {trackingEvents && (
            <>
              {/* Tabs */}
              {(() => {
                const ANALYTICS_TABS = [
                  { key: 'all',         label: t('emailMarketing.analytics.tabAll') },
                  { key: 'delivered',   label: t('emailMarketing.analytics.tabDelivered') },
                  { key: 'open',        label: t('emailMarketing.analytics.tabOpen') },
                  { key: 'click',       label: t('emailMarketing.analytics.tabClick') },
                  { key: 'bounce',      label: t('emailMarketing.analytics.tabBounce') },
                  { key: 'unsubscribe', label: t('emailMarketing.analytics.tabUnsubscribe') },
                ]
                const counts = {}
                trackingEvents.forEach(e => { counts[e.event_type] = (counts[e.event_type] || 0) + 1 })
                const filtered = trackingTab === 'all' ? trackingEvents : trackingEvents.filter(e => e.event_type === trackingTab)

                return (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex gap-1 flex-wrap">
                        {ANALYTICS_TABS.map(tab => {
                          const count = tab.key === 'all' ? trackingEvents.length : (counts[tab.key] || 0)
                          const COLOR = { delivered: 'text-green-400', open: 'text-blue-400', click: 'text-purple-400', bounce: 'text-red-400', unsubscribe: 'text-amber-400' }
                          return (
                            <button key={tab.key}
                              onClick={() => setTrackingTab(tab.key)}
                              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${trackingTab === tab.key ? 'bg-white/10 border-slate-500/60 text-slate-200' : 'border-z-border text-slate-500 hover:bg-white/5'}`}>
                              {tab.label}
                              {count > 0 && (
                                <span className={`ml-1.5 font-bold ${trackingTab === tab.key ? 'text-slate-300' : (COLOR[tab.key] || 'text-slate-400')}`}>{count}</span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={loadTrackingEvents} disabled={trackingLoading}
                          className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                          {trackingLoading ? t('emailMarketing.analytics.updating') : t('emailMarketing.analytics.refresh')}
                        </button>
                        <button onClick={exportTrackingToExcel} disabled={!filtered.length}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-400 border border-green-400/30 rounded-lg hover:bg-green-400/10 transition-colors disabled:opacity-40">
                          <ArrowDownTrayIcon className="w-3.5 h-3.5" /> {t('emailMarketing.analytics.exportExcel')}
                        </button>
                      </div>
                    </div>

                    {/* Table */}
                    {filtered.length === 0 ? (
                      <p className="text-center text-slate-600 text-sm py-8">
                        {trackingTab === 'all' ? t('emailMarketing.analytics.noEventsAll') : t('emailMarketing.analytics.noEventsFiltered')}
                      </p>
                    ) : (
                      <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-xl border border-z-border">
                        <table className="w-full text-xs min-w-[500px]">
                          <thead className="bg-black/20 sticky top-0">
                            <tr>
                              {[t('emailMarketing.analytics.headers.email'), t('emailMarketing.analytics.headers.event'), t('emailMarketing.analytics.headers.template'), t('emailMarketing.analytics.headers.urlDetail'), t('emailMarketing.analytics.headers.date')].map(h => (
                                <th key={h} className="px-3 py-2.5 text-left font-medium text-slate-500 uppercase tracking-wide">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-z-border">
                            {filtered.map(ev => {
                              const BADGE = {
                                delivered:   'bg-green-500/15 text-green-400',
                                open:        'bg-blue-500/15 text-blue-400',
                                click:       'bg-purple-500/15 text-purple-400',
                                bounce:      'bg-red-500/15 text-red-400',
                                dropped:     'bg-red-500/15 text-red-400',
                                unsubscribe: 'bg-amber-500/15 text-amber-400',
                                spamreport:  'bg-orange-500/15 text-orange-400',
                              }
                              const LABEL = { delivered: t('emailMarketing.analytics.eventDelivered'), open: t('emailMarketing.analytics.eventOpen'), click: t('emailMarketing.analytics.eventClick'), bounce: t('emailMarketing.analytics.eventBounce'), dropped: t('emailMarketing.analytics.eventDropped'), unsubscribe: t('emailMarketing.analytics.eventUnsubscribe'), spamreport: t('emailMarketing.analytics.eventSpamreport') }
                              return (
                                <tr key={ev.id} className="hover:bg-white/[0.02]">
                                  <td className="px-3 py-2 font-mono text-slate-300 max-w-[180px] truncate">{ev.email}</td>
                                  <td className="px-3 py-2">
                                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[ev.event_type] || 'bg-slate-500/15 text-slate-400'}`}>
                                      {LABEL[ev.event_type] || ev.event_type}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-500">{ev.template_key || '—'}</td>
                                  <td className="px-3 py-2 max-w-[200px] truncate">
                                    {ev.url
                                      ? <a href={ev.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline truncate block">{ev.url}</a>
                                      : <span className="text-slate-700">—</span>}
                                  </td>
                                  <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                                    {ev.timestamp ? new Date(ev.timestamp).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-slate-700">{t('emailMarketing.analytics.showingLast')}</p>
                  </>
                )
              })()}
            </>
          )}
        </div>
      </Section>

      {/* ── 8. HISTORIAL DE ENVÍOS ── */}
      {emailHistory.length > 0 && (
        <Section id="historial" label={t('emailMarketing.history.title')} icon={ClockIcon}
          badge={t('emailMarketing.history.badgeCount', { count: emailHistory.length })} openSections={openSections} toggle={toggle}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead className="bg-black/20">
                <tr>
                  {[t('emailMarketing.history.headers.date'), t('emailMarketing.history.headers.template'), t('emailMarketing.history.headers.campaign'), t('emailMarketing.history.headers.sent'), t('emailMarketing.history.headers.failed'), t('emailMarketing.history.headers.by'), ''].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-z-border">
                {emailHistory.map(h => (
                  <tr key={h.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(h.sent_at).toLocaleString(dateLocale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-300 max-w-[160px]">
                      <p className="font-medium truncate">{allTemplates.find(tp => tp.key === h.template_key)?.label || h.template_key}</p>
                      {h.template_subject && <p className="text-slate-500 truncate">{h.template_subject}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{h.campaign_name || t('emailMarketing.history.allCampaigns')}</td>
                    <td className="px-4 py-2.5"><span className="text-green-400 font-bold text-sm">{h.total_sent}</span></td>
                    <td className="px-4 py-2.5">
                      {h.total_errors > 0 ? (
                        <button
                          onClick={() => setErrorDetailLog(h)}
                          className="text-red-400 font-medium text-sm hover:text-red-300 hover:underline transition-colors"
                          title={t('emailMarketing.history.viewErrorsTitle')}
                        >
                          {h.total_errors} ▸
                        </button>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 truncate max-w-[120px]">{h.initiated_by || '—'}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {h.total_sent > 0 && (
                          <button
                            onClick={() => setSentDetailLog(h)}
                            className="text-xs text-slate-400 hover:text-slate-200 border border-slate-600/40 hover:border-slate-500/60 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap"
                            title={t('emailMarketing.history.viewSentTitle')}
                          >
                            {t('emailMarketing.history.viewSent')}
                          </button>
                        )}
                        <button
                          onClick={() => resumeFromHistory(h)}
                          className="text-xs text-blue-400 hover:text-blue-300 border border-blue-400/20 hover:border-blue-400/40 rounded-lg px-2.5 py-1 transition-colors whitespace-nowrap"
                          title={t('emailMarketing.history.resumeTitle')}
                        >
                          {t('emailMarketing.history.resume')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      </>)}

      {/* Modal: vista previa de destinatarios */}
      {recipientDetailOpen && recipientDetail && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-z-border flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-100">{t('emailMarketing.recipientDetailModal.title')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('emailMarketing.recipientDetailModal.summary', { willReceive: recipientDetail.will_receive.length, skipped: recipientDetail.skipped.length })}
                </p>
              </div>
              <button onClick={() => setRecipientDetailOpen(false)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex border-b border-z-border flex-shrink-0">
              <button onClick={() => setRecipientDetailTab('will_receive')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${recipientDetailTab === 'will_receive' ? 'text-green-400 border-b-2 border-green-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {t('emailMarketing.recipientDetailModal.willReceiveTab', { count: recipientDetail.will_receive.length })}
              </button>
              <button onClick={() => setRecipientDetailTab('skipped')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${recipientDetailTab === 'skipped' ? 'text-amber-400 border-b-2 border-amber-400' : 'text-slate-500 hover:text-slate-300'}`}>
                {t('emailMarketing.recipientDetailModal.skippedTab', { count: recipientDetail.skipped.length })}
              </button>
            </div>
            <div className="overflow-auto flex-1">
              {recipientDetailTab === 'will_receive' && (
                recipientDetail.will_receive.length === 0
                  ? <p className="text-center text-slate-500 text-sm py-10">{t('emailMarketing.recipientDetailModal.noWillReceive')}</p>
                  : <table className="w-full text-sm">
                      <thead className="bg-black/20 sticky top-0">
                        <tr>{[t('emailMarketing.recipientDetailModal.headers.name'), t('emailMarketing.recipientDetailModal.headers.email'), t('emailMarketing.recipientDetailModal.headers.phone'), t('emailMarketing.recipientDetailModal.headers.campaign')].map(h => (
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
                  ? <p className="text-center text-slate-500 text-sm py-10">{t('emailMarketing.recipientDetailModal.noSkipped')}</p>
                  : <table className="w-full text-sm">
                      <thead className="bg-black/20 sticky top-0">
                        <tr>{[t('emailMarketing.recipientDetailModal.headers.name'), t('emailMarketing.recipientDetailModal.headers.email'), t('emailMarketing.recipientDetailModal.headers.phone'), t('emailMarketing.recipientDetailModal.headers.campaign'), t('emailMarketing.recipientDetailModal.headers.reason')].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody className="divide-y divide-z-border">
                        {recipientDetail.skipped.map(c => (
                          <tr key={c.id} className="hover:bg-white/[0.02]">
                            <td className="px-4 py-2.5 text-slate-200 font-medium">{c.name || '—'}</td>
                            <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">{c.email || <span className="text-slate-600 italic">{t('emailMarketing.lists.noEmail')}</span>}</td>
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
              <button onClick={() => setRecipientDetailOpen(false)} className="z-btn-ghost text-sm">{t('emailMarketing.recipientDetailModal.close')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle de destinatarios enviados */}
      {sentDetailLog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-z-border flex-shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-100">{t('emailMarketing.sentDetailModal.title')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('emailMarketing.sentDetailModal.summary', { count: sentDetailLog.total_sent, plural: sentDetailLog.total_sent !== 1 ? 's' : '' })}
                  {sentDetailLog.template_subject && ` · "${sentDetailLog.template_subject}"`}
                </p>
              </div>
              <button onClick={() => setSentDetailLog(null)} className="text-slate-500 hover:text-slate-300">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {sentDetailLog.sent_details?.length > 0 ? (
                <table className="w-full text-sm">
                  <thead className="bg-black/20 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{t('emailMarketing.sentDetailModal.headers.name')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{t('emailMarketing.sentDetailModal.headers.email')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-z-border">
                    {sentDetailLog.sent_details.map((c, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-2.5 text-xs text-slate-300 font-medium">{c.name || '—'}</td>
                        <td className="px-4 py-2.5 text-xs font-mono text-slate-400">{c.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="p-8 text-center">
                  <p className="text-slate-400 text-sm">{t('emailMarketing.sentDetailModal.noDetail')}</p>
                  <p className="text-xs mt-1 text-slate-600">{t('emailMarketing.sentDetailModal.noDetailHint')}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-z-border flex-shrink-0 flex justify-end">
              <button onClick={() => setSentDetailLog(null)} className="z-btn-ghost text-sm">{t('emailMarketing.sentDetailModal.close')}</button>
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
                <h2 className="text-base font-bold text-slate-100">{t('emailMarketing.errorDetailModal.title')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {t('emailMarketing.errorDetailModal.summary', { count: errorDetailLog.total_errors, plural: errorDetailLog.total_errors !== 1 ? 's' : '' })}
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
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{t('emailMarketing.errorDetailModal.headers.email')}</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">{t('emailMarketing.errorDetailModal.headers.error')}</th>
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
                  <p className="text-slate-400 text-sm">{t('emailMarketing.errorDetailModal.noDetail')}</p>
                  <p className="text-xs mt-1 text-slate-600">{t('emailMarketing.errorDetailModal.noDetailHint')}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-z-border flex-shrink-0 flex justify-between items-center">
              <span className="text-xs text-slate-600">
                {errorDetailLog.error_details?.length > 0 ? t('emailMarketing.errorDetailModal.commonCauses') : ''}
              </span>
              <button onClick={() => setErrorDetailLog(null)} className="z-btn-ghost text-sm">{t('emailMarketing.errorDetailModal.close')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
