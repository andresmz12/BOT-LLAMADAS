import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../api/client'

const ROLES = ['admin', 'agent', 'viewer']
const inputCls = "w-full bg-[#0F172A] border border-zyra-border rounded-lg px-3 py-2 text-sm text-zyra-text focus:outline-none focus:border-zyra-blue"

export default function OrgUsers() {
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null)

  const load = () => api.get('/users').then(r => setUsers(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const handleDeactivate = async (user) => {
    if (!confirm(`¿Desactivar a "${user.full_name}"?`)) return
    try { await api.delete(`/users/${user.id}`); load() }
    catch (err) { alert(err.response?.data?.detail || 'Error') }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zyra-text">Usuarios de la Organización</h1>
        <button onClick={() => setModal({ data: null })}
          className="flex items-center gap-2 px-4 py-2 bg-zyra-blue hover:bg-blue-700 text-white font-semibold rounded-lg text-sm">
          <PlusIcon className="w-4 h-4" /> Nuevo usuario
        </button>
      </div>

      <div className="bg-zyra-card rounded-xl border border-zyra-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#0F172A]">
            <tr>
              {['Nombre', 'Email', 'Rol', 'Estado', 'Acciones'].map(h => (
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
                  <span className="px-2 py-0.5 bg-zyra-blue/20 text-blue-300 text-xs rounded-full font-medium">{user.role}</span>
                </td>
                <td className="px-6 py-3">
                  <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${user.is_active ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400'}`}>
                    {user.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td className="px-6 py-3 flex gap-2">
                  <button onClick={() => setModal({ data: user })} className="text-zyra-muted hover:text-zyra-text">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  {user.is_active && (
                    <button onClick={() => handleDeactivate(user)} className="text-zyra-muted hover:text-red-400">
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-zyra-muted">No hay usuarios en tu organización</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {modal && (
        <UserModal
          user={modal.data}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
        />
      )}
    </div>
  )
}

function UserModal({ user, onClose, onSaved }) {
  const [form, setForm] = useState(user || { email: '', password: '', full_name: '', role: 'agent' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      if (user?.id) {
        await api.put(`/users/${user.id}`, { full_name: form.full_name, role: form.role, is_active: form.is_active !== false })
      } else {
        await api.post('/users', form)
      }
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
          {!user && (
            <>
              <div>
                <label className="block text-sm font-medium text-zyra-muted mb-1">Email</label>
                <input type="email" value={form.email} onChange={e => set('email', e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-sm font-medium text-zyra-muted mb-1">Contraseña</label>
                <input type="password" value={form.password} onChange={e => set('password', e.target.value)} required className={inputCls} />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium text-zyra-muted mb-1">Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
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
