import { NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon,
  KeyIcon, ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../api/client'

const navItems = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon },
  { to: '/agents', label: 'Agentes', Icon: UserGroupIcon },
  { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
  { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
  { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
  { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
]

export default function Sidebar() {
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isSuperAdmin = user.role === 'superadmin'
  const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="w-60 bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center">
          <span className="text-sidebar font-black text-sm">ISM</span>
        </div>
        <div className="leading-none">
          <div className="text-gold font-bold text-sm">Voice Agent</div>
          <div className="text-gray-500 text-xs">{user.organization_name || 'ISM Consulting'}</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gold/15 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {label}
          </NavLink>
        ))}

        {isSuperAdmin && (
          <NavLink
            to="/admin"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-gold/15 text-gold' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <KeyIcon className="w-5 h-5 flex-shrink-0" />
            Admin
          </NavLink>
        )}
      </nav>

      <div className="px-4 py-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gold/20 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-gold font-bold text-xs">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-xs font-medium truncate">{user.full_name || 'Usuario'}</div>
            <div className="text-gray-500 text-xs truncate">{user.email || ''}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-400 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors"
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
