import { useState, useEffect } from 'react'
import { ChatBubbleLeftRightIcon, CheckCircleIcon, ClipboardDocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import SecretInput from '../components/SecretInput'
import { getWhatsappSettings, saveWhatsappSettings, getWaConversations, getWaMessages } from '../api/client'
import { fmtDate } from '../utils/date'

export default function WhatsApp() {
  const userRole = JSON.parse(localStorage.getItem('user') || '{}').role || 'agent'
  const canConfig = userRole === 'admin' || userRole === 'superadmin'

  const [config, setConfig] = useState({ whatsapp_enabled: false, whatsapp_phone_number_id: '', whatsapp_access_token: '', whatsapp_verify_token: '' })
  const [webhookUrl, setWebhookUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const [conversations, setConversations] = useState([])
  const [activeConv, setActiveConv] = useState(null)
  const [messages, setMessages] = useState([])
  const [showConfig, setShowConfig] = useState(false)

  useEffect(() => {
    if (canConfig) {
      getWhatsappSettings().then(d => {
        setConfig({ whatsapp_enabled: d.whatsapp_enabled, whatsapp_phone_number_id: d.whatsapp_phone_number_id || '', whatsapp_access_token: d.whatsapp_access_token || '', whatsapp_verify_token: d.whatsapp_verify_token || '' })
        setWebhookUrl(d.webhook_url || '')
        if (!d.whatsapp_phone_number_id) setShowConfig(true)
      }).catch(() => {})
    }
    getWaConversations().then(setConversations).catch(() => {})
  }, [])

  const openConversation = async (conv) => {
    setActiveConv(conv)
    getWaMessages(conv.id).then(setMessages).catch(() => {})
  }

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    try {
      await saveWhatsappSettings(config)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      alert(err.response?.data?.detail || 'Error al guardar')
    } finally { setSaving(false) }
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const set = (k, v) => setConfig(f => ({ ...f, [k]: v }))

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Chatbot WhatsApp</h1>
          <p className="text-sm text-slate-500 mt-0.5">Bot conversacional — responde automáticamente con IA usando tu agente configurado</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 text-xs font-semibold rounded-full ${config.whatsapp_enabled ? 'bg-green-500/15 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
            {config.whatsapp_enabled ? 'Activo' : 'Inactivo'}
          </span>
          {canConfig && (
            <button onClick={() => setShowConfig(s => !s)} className="z-btn-ghost text-sm">
              {showConfig ? 'Ocultar config' : 'Configurar'}
            </button>
          )}
        </div>
      </div>

      {/* Config accordion */}
      {canConfig && showConfig && (
        <div className="bg-z-card border border-z-border rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Configuración — Meta WhatsApp Business API</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={config.whatsapp_enabled} onChange={e => set('whatsapp_enabled', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-slate-300">Activar bot conversacional</span>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Phone Number ID</label>
              <input value={config.whatsapp_phone_number_id} onChange={e => set('whatsapp_phone_number_id', e.target.value)}
                placeholder="123456789012345" className="z-input font-mono" />
              <p className="text-xs text-slate-600 mt-1">Meta for Developers → WhatsApp → API Setup</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Verify Token</label>
              <input value={config.whatsapp_verify_token} onChange={e => set('whatsapp_verify_token', e.target.value)}
                placeholder="zyra-wa-secreto-2025" className="z-input font-mono" />
              <p className="text-xs text-slate-600 mt-1">String secreto que eliges tú — úsalo al registrar el webhook en Meta</p>
            </div>
          </div>

          <SecretInput label="Access Token" value={config.whatsapp_access_token}
            onChange={e => set('whatsapp_access_token', e.target.value)}
            placeholder="Token permanente de Meta" />

          {webhookUrl && (
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">URL del Webhook (pega esto en Meta)</label>
              <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 border border-z-border">
                <span className="text-xs font-mono text-slate-400 flex-1 truncate">{webhookUrl}</span>
                <button type="button" onClick={copyUrl} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0">
                  {copied ? <CheckCircleIcon className="w-4 h-4 text-green-400" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={saving} className="z-btn-primary disabled:opacity-50">
            {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      )}

      {/* Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" style={{ minHeight: 400 }}>
        {/* List */}
        <div className="bg-z-card border border-z-border rounded-xl overflow-hidden lg:col-span-1">
          <div className="p-4 border-b border-z-border">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wide">Conversaciones</h2>
          </div>
          <div className="divide-y divide-z-border overflow-y-auto max-h-[520px]">
            {conversations.length === 0 && (
              <div className="p-6 text-center text-slate-500 text-sm">
                <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                Sin conversaciones aún
              </div>
            )}
            {conversations.map(conv => (
              <button key={conv.id} onClick={() => openConversation(conv)}
                className={`w-full text-left px-4 py-3 hover:bg-white/[0.03] transition-colors ${activeConv?.id === conv.id ? 'bg-z-blue/10 border-l-2 border-z-blue' : ''}`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-sm font-medium text-slate-200 truncate">
                    {conv.contact_name || conv.wa_contact_id}
                  </span>
                  <span className="text-xs text-slate-600 flex-shrink-0 ml-2">{fmtDate(conv.updated_at).split(',')[0]}</span>
                </div>
                {conv.last_message && (
                  <p className="text-xs text-slate-500 truncate">
                    {conv.last_role === 'assistant' ? '🤖 ' : '👤 '}{conv.last_message}
                  </p>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages panel */}
        <div className="bg-z-card border border-z-border rounded-xl overflow-hidden lg:col-span-2 flex flex-col">
          {!activeConv ? (
            <div className="flex-1 flex items-center justify-center text-slate-600 text-sm">
              <div className="text-center">
                <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
                Selecciona una conversación
              </div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-z-border flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-200">{activeConv.contact_name || activeConv.wa_contact_id}</p>
                  <p className="text-xs text-slate-500 font-mono">{activeConv.wa_contact_id}</p>
                </div>
                <button onClick={() => { setActiveConv(null); setMessages([]) }} className="text-slate-500 hover:text-slate-300">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[460px]">
                {messages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.role === 'assistant' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm ${
                      msg.role === 'assistant'
                        ? 'bg-z-blue/15 text-slate-200 rounded-tl-sm'
                        : 'bg-slate-700 text-slate-100 rounded-tr-sm'
                    }`}>
                      <p>{msg.content}</p>
                      <p className="text-xs opacity-50 mt-1 text-right">{fmtDate(msg.created_at)}</p>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && <p className="text-center text-slate-600 text-sm">Sin mensajes</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
