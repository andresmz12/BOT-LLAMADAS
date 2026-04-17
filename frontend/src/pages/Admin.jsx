import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getOrganizations, createOrganization, updateOrganization,
  getUsers, createUser, updateUser, deleteUser,
} from '../api/client'

const ROLES = ['superadmin', 'admin', 'agent', 'viewer']
const PLANS = ['free', 'basic', 'pro']

const inputCls = "w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"

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

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-zyra-text">Panel de Administración</h1>

      <div className="flex gap-1 bg-[#0F172A] rounded-lg p-1 w-fit">
        {[['orgs', 'Organizaciones'], ['users', 'Usuarios']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === key ? 'bg-zyra-card text-zyra-text shadow-sm' : 'text-zyra-muted hover:text-zyra-text'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'orgs' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-zyra-text">Organizaciones</h2>
            <button onClick={() => setModal({ type: 'org', data: null })}
              className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm">
              <PlusIcon className="w-4 h-4" /> Nueva
            </button>
          </div>
          <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0F172A]">
                <tr>
                  {['ID', 'Nombre', 'Plan', 'Activa', 'Acciones'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zyra-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zyra-border">
                {orgs.map(org => (
                  <tr key={org.id} className="hover:bg-white/5">
                    <td className="px-6 py-3 text-zyra-muted text-xs">{org.id}</td>
                    <td className="px-6 py-3 font-medium text-zyra-text">{org.name}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-blue-900/40 text-blue-400 text-xs rounded-full font-medium">{org.plan}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {org.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <button onClick={() => setModal({ type: 'org', data: org })} className="text-zyra-muted hover:text-zyra-text">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-zyra-muted">No hay organizaciones</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'users' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-zyra-text">Usuarios</h2>
            <button onClick={() => setModal({ type: 'user', data: null })}
              className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm">
              <PlusIcon className="w-4 h-4" /> Nuevo
            </button>
          </div>
          <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#0F172A]">
                <tr>
                  {['Nombre', 'Email', 'Rol', 'Organización', 'Activo', 'Acciones'].map(h => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-zyra-muted uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zyra-border">
                {users.map(user => (
                  <tr key={user.id} className="hover:bg-white/5">
                    <td className="px-6 py-3 font-medium text-zyra-text">{user.full_name}</td>
                    <td className="px-6 py-3 text-zyra-muted text-xs">{user.email}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 bg-purple-900/40 text-purple-400 text-xs rounded-full font-medium">{user.role}</span>
                    </td>
                    <td className="px-6 py-3 text-zyra-muted text-xs">{user.organization_name || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${user.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                        {user.is_active ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-3 flex gap-2">
                      <button onClick={() => setModal({ type: 'user', data: user })} className="text-zyra-muted hover:text-zyra-text">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteUser(user)} className="text-zyra-muted hover:text-red-400">
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-zyra-muted">No hay usuarios</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal?.type === 'org' && (
        <OrgModal org={modal.data} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadOrgs() }} />
      )}
      {modal?.type === 'user' && (
        <UserModal user={modal.data} orgs={orgs} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadUsers() }} />
      )}
    </div>
  )
}

function OrgModal({ org, onClose, onSaved }) {
  const [form, setForm] = useState(org || {
    name: '', plan: 'basic', retell_api_key: '', retell_phone_number: '', anthropic_api_key: '', is_active: true
  })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (org?.id) await updateOrganization(org.id, form)
      else await createOrganization(form)
      onSaved()
    } catch (err) {
      alert(err.response?.data?.detail || 'Error')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <h2 className="text-lg font-bold text-zyra-text">{org ? 'Editar Organización' : 'Nueva Organización'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Nombre</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Plan</label>
            <select value={form.plan} onChange={e => set('plan', e.target.value)} className={inputCls}>
              {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Retell API Key</label>
            <input value={form.retell_api_key || ''} onChange={e => set('retell_api_key', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Retell Phone Number</label>
            <input value={form.retell_phone_number || ''} onChange={e => set('retell_phone_number', e.target.value)}
              placeholder="+12345678901" className={inputCls} />
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Anthropic API Key</label>
            <input value={form.anthropic_api_key || ''} onChange={e => set('anthropic_api_key', e.target.value)} className={inputCls} />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm text-zyra-muted">Organización activa</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zyra-muted hover:text-zyra-text">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-zyra-card rounded-2xl border border-zyra-border w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-zyra-border">
          <h2 className="text-lg font-bold text-zyra-text">{user ? 'Editar Usuario' : 'Nuevo Usuario'}</h2>
          <button onClick={onClose}><XMarkIcon className="w-6 h-6 text-zyra-muted" /></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Nombre completo</label>
            <input value={form.full_name} onChange={e => set('full_name', e.target.value)} required className={inputCls} />
          </div>
          {!user && <>
            <div>
              <label className="block text-sm font-medium text-zyra-muted mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-zyra-muted mb-1">Contraseña</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required className={inputCls} />
            </div>
          </>}
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Organización</label>
            <select value={form.organization_id || ''} onChange={e => set('organization_id', e.target.value ? Number(e.target.value) : null)} className={inputCls}>
              <option value="">Sin organización</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          {user && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active !== false} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 accent-blue-500" />
              <span className="text-sm text-zyra-muted">Usuario activo</span>
            </label>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-zyra-muted hover:text-zyra-text">Cancelar</button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
