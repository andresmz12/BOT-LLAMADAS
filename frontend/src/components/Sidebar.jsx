import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon,
  KeyIcon, ArrowRightOnRectangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../api/client'

const NAV_BY_ROLE = {
  superadmin: [
    { to: '/', label: 'Dashboard', Icon: HomeIcon },
    { to: '/admin', label: 'Admin Panel', Icon: KeyIcon },
    { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
  ],
  admin: [
    { to: '/', label: 'Dashboard', Icon: HomeIcon },
    { to: '/agents', label: 'Agentes', Icon: UserGroupIcon },
    { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
    { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
  ],
  agent: [
    { to: '/', label: 'Dashboard', Icon: HomeIcon },
    { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
  ],
  viewer: [
    { to: '/', label: 'Dashboard', Icon: HomeIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
  ],
}

function WaveformIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 16 Q4 8 6 16 Q8 24 10 16 Q12 8 14 16 Q16 24 18 16 Q20 8 22 16 Q24 24 26 16 Q28 8 30 16"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const role = user.role || 'viewer'
  const navItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.viewer
  const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className={`${collapsed ? 'w-16' : 'w-60'} bg-sidebar flex flex-col h-screen sticky top-0 transition-all duration-200 flex-shrink-0 border-r border-z-border`}>
      {/* Logo */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-5'} py-4 border-b border-z-border min-h-[60px]`}>
        <WaveformIcon className="w-7 h-7 text-z-blue flex-shrink-0" />
        {!collapsed && (
          <span className="font-black text-lg leading-none">
            <span className="text-white">Zyra</span><span className="text-z-blue">Voice</span>
          </span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to + label}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-z-blue/15 text-z-blue-light'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* User + logout */}
      <div className="px-2 py-3 border-t border-z-border space-y-1">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 bg-z-blue/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-z-blue-light font-bold text-xs">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-200 text-xs font-medium truncate">{user.full_name || 'Usuario'}</div>
              <div className="text-slate-500 text-xs truncate">{user.organization_name || ''}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          title="Cerrar sesión"
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} w-full px-3 py-2 text-xs text-slate-500 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors`}
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && 'Cerrar sesión'}
        </button>
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center justify-center w-full px-3 py-1.5 text-slate-600 hover:text-slate-400 rounded-lg hover:bg-white/5 transition-colors"
        >
          {collapsed
            ? <ChevronRightIcon className="w-4 h-4" />
            : <ChevronLeftIcon className="w-4 h-4" />
          }
        </button>
      </div>
    </aside>
  )
}
