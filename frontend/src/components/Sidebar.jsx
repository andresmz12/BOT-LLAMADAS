import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon,
  ChartBarIcon, CreditCardIcon, BuildingOfficeIcon,
  ArrowRightOnRectangleIcon, ChevronLeftIcon, ChevronRightIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../api/client'

function WaveIcon({ className = 'w-6 h-6' }) {
  return (
    <svg viewBox="0 0 28 24" fill="none" className={className}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="0"  y="9"  width="4" height="6"  rx="2" fill="url(#wg)" />
      <rect x="6"  y="5"  width="4" height="14" rx="2" fill="url(#wg)" />
      <rect x="12" y="1"  width="4" height="22" rx="2" fill="url(#wg)" />
      <rect x="18" y="5"  width="4" height="14" rx="2" fill="url(#wg)" />
      <rect x="24" y="9"  width="4" height="6"  rx="2" fill="url(#wg)" />
    </svg>
  )
}

const NAV_BY_ROLE = {
  superadmin: [
    { to: '/',          label: 'Dashboard',      Icon: HomeIcon },
    { to: '/admin',     label: 'Panel Admin',    Icon: BuildingOfficeIcon },
    { to: '/analytics', label: 'Analytics',      Icon: ChartBarIcon },
    { to: '/billing',   label: 'Facturación',    Icon: CreditCardIcon },
    { to: '/settings',  label: 'Config',         Icon: Cog6ToothIcon },
  ],
  admin: [
    { to: '/',          label: 'Dashboard',   Icon: HomeIcon },
    { to: '/agents',    label: 'Agentes',     Icon: UserGroupIcon },
    { to: '/campaigns', label: 'Campañas',    Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Prospectos',  Icon: UsersIcon },
    { to: '/calls',     label: 'Llamadas',    Icon: PhoneIcon },
    { to: '/org-users', label: 'Usuarios',    Icon: UsersIcon },
    { to: '/analytics', label: 'Analytics',   Icon: ChartBarIcon },
    { to: '/settings',  label: 'Config',      Icon: Cog6ToothIcon },
  ],
  agent: [
    { to: '/',          label: 'Dashboard',      Icon: HomeIcon },
    { to: '/campaigns', label: 'Mis Campañas',   Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Mis Prospectos', Icon: UsersIcon },
    { to: '/calls',     label: 'Mis Llamadas',   Icon: PhoneIcon },
  ],
  viewer: [
    { to: '/',          label: 'Dashboard', Icon: HomeIcon },
    { to: '/calls',     label: 'Llamadas',  Icon: PhoneIcon },
    { to: '/analytics', label: 'Analytics', Icon: ChartBarIcon },
  ],
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const role = user.role || 'viewer'
  const navItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.viewer
  const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} bg-zyra-card border-r border-zyra-border flex flex-col h-screen sticky top-0 transition-all duration-200`}
    >
      {/* Header */}
      <div className={`flex items-center ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} py-5 border-b border-zyra-border`}>
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <WaveIcon className="w-7 h-6 flex-shrink-0" />
            <span className="text-white font-black text-lg leading-none">Zyra</span>
            <span className="text-blue-400 font-black text-lg leading-none">Voice</span>
          </div>
        )}
        {collapsed && <WaveIcon className="w-7 h-6" />}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="text-zyra-muted hover:text-zyra-text transition-colors flex-shrink-0"
        >
          {collapsed
            ? <ChevronRightIcon className="w-4 h-4" />
            : <ChevronLeftIcon className="w-4 h-4" />
          }
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to + label}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                collapsed ? 'justify-center' : ''
              } ${
                isActive
                  ? 'bg-zyra-blue/15 text-zyra-blue'
                  : 'text-zyra-muted hover:text-zyra-text hover:bg-white/5'
              }`
            }
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={`${collapsed ? 'px-2' : 'px-4'} py-4 border-t border-zyra-border space-y-3`}>
        {!collapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zyra-blue/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-zyra-blue font-bold text-xs">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-zyra-text text-xs font-medium truncate">{user.full_name || 'Usuario'}</div>
              <div className="text-zyra-muted text-xs truncate">{user.email || ''}</div>
            </div>
          </div>
        )}
        <button
          onClick={logout}
          title={collapsed ? 'Cerrar sesión' : undefined}
          className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zyra-muted hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors ${collapsed ? 'justify-center' : ''}`}
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4" />
          {!collapsed && 'Cerrar sesión'}
        </button>
      </div>
    </aside>
  )
}
