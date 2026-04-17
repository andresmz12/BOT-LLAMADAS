import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import {
  getOrganizations, createOrganization, updateOrganization,
  getUsers, createUser, updateUser, deleteUser,
} from '../api/client'

const ROLES = ['superadmin', 'admin', 'agent', 'viewer']
const PLANS = ['free', 'basic', 'pro']

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
                  {['ID', 'Nombre', 'Plan', 'Activa', 'Acciones'].map(h => (
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
                      <span className="px-2 py-0.5 bg-z-blue/15 text-z-blue-light text-xs rounded-full font-medium">{org.plan}</span>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${org.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {org.is_active ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <button onClick={() => setModal({ type: 'org', data: org })}
                        className="text-slate-500 hover:text-slate-300">
                        <PencilIcon className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {orgs.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-slate-500">No hay organizaciones</td></tr>
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
