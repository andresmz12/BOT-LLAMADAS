import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import { useTranslation } from 'react-i18next'
import { getTeam, createTeamMember, updateTeamMember, deleteTeamMember } from '../api/client'
import SecretInput from '../components/SecretInput'

export default function Users() {
  const { t } = useTranslation()
  const [members, setMembers] = useState([])
  const [modal, setModal] = useState(null)

  const load = () => getTeam().then(setMembers).catch(() => {})

  useEffect(() => { load() }, [])

  const handleDelete = async (member) => {
    if (!confirm(t('users.confirm_delete', { name: member.full_name }))) return
    try { await deleteTeamMember(member.id); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{t('users.title')}</h1>
          <p className="text-sm text-slate-500 mt-0.5">{t('users.subtitle')}</p>
        </div>
        <button onClick={() => setModal({ data: null })} className="z-btn-primary flex items-center gap-2 self-start sm:self-auto">
          <PlusIcon className="w-4 h-4" /> {t('users.new')}
        </button>
      </div>

      <div className="bg-z-card rounded-xl border border-z-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead className="bg-black/20">
              <tr>
                {[t('users.col_name'), t('users.col_email'), t('users.col_role'), t('users.col_status'), t('users.col_actions')].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-z-border">
              {members.map(m => (
                <tr key={m.id} className="hover:bg-white/[0.02]">
                  <td className="px-6 py-3 font-medium text-slate-200">{m.full_name}</td>
                  <td className="px-6 py-3 text-slate-400 text-xs">{m.email}</td>
                  <td className="px-6 py-3">
                    <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 text-xs rounded-full font-medium">{m.role}</span>
                  </td>
                  <td className="px-6 py-3">
                    <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${m.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {m.is_active ? t('common.active') : t('common.inactive')}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => setModal({ data: m })} className="text-slate-500 hover:text-slate-300">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(m)} className="text-slate-500 hover:text-red-400">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">{t('users.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <MemberModal
          member={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

function MemberModal({ member, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(member || { email: '', password: '', full_name: '', is_active: true })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (member?.id) {
        await updateTeamMember(member.id, { full_name: form.full_name, is_active: form.is_active })
      } else {
        await createTeamMember({ email: form.email, password: form.password, full_name: form.full_name })
      }
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || t('users.error_save'))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-z-card border border-z-border rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-z-border">
          <h2 className="text-lg font-bold text-slate-100">{member ? t('users.modal_edit') : t('users.modal_new')}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-slate-500" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">{t('users.field_name')}</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required className="z-input" />
          </div>
          {!member && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">{t('users.field_email')}</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className="z-input" />
              </div>
              <SecretInput
                label={t('users.field_password')}
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={t('users.field_password_placeholder')}
                required
              />
            </>
          )}
          {member && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-slate-300">{t('users.field_active')}</span>
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="z-btn-ghost">{t('common.cancel')}</button>
            <button type="submit" disabled={loading} className="z-btn-primary disabled:opacity-50">
              {loading ? t('users.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
