import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon,
  KeyIcon, ArrowRightOnRectangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  ChatBubbleLeftRightIcon, FireIcon, EnvelopeIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../api/client'

const NAV_BY_ROLE = {
  superadmin: [
    { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { to: '/admin', label: 'Admin Panel', Icon: KeyIcon },
    { to: '/chatbot', label: 'Chatbot', Icon: ChatBubbleLeftRightIcon },
    { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
  ],
  admin: [
    { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { to: '/leads', label: 'Centro de Leads', Icon: FireIcon },
    { to: '/agents', label: 'Agentes de Voz', Icon: UserGroupIcon },
    { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
    { to: '/email-marketing', label: 'Email Marketing', Icon: EnvelopeIcon },
    { to: '/chatbot', label: 'Chatbot', Icon: ChatBubbleLeftRightIcon },
    { to: '/team', label: 'Asesores', Icon: UsersIcon },
    { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
  ],
  agent: [
    { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { to: '/leads', label: 'Centro de Leads', Icon: FireIcon },
    { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
    { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
    { to: '/email-marketing', label: 'Email Marketing', Icon: EnvelopeIcon },
    { to: '/chatbot', label: 'Chatbot', Icon: ChatBubbleLeftRightIcon },
  ],
  viewer: [
    { to: '/dashboard', label: 'Dashboard', Icon: HomeIcon },
    { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
  ],
}

export function WaveformIcon({ className }) {
  const bars = [
    { x: 1.5,  h: 8,  y: 12 },
    { x: 5.5,  h: 14, y: 9  },
    { x: 9.5,  h: 22, y: 5  },
    { x: 13.5, h: 28, y: 2  },
    { x: 17.5, h: 28, y: 2  },
    { x: 21.5, h: 22, y: 5  },
    { x: 25.5, h: 14, y: 9  },
    { x: 29,   h: 8,  y: 12 },
  ]
  return (
    <svg className={className} viewBox="0 0 32 32" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={b.y} width="2" height={b.h} rx="1"
          opacity={0.4 + (i < 4 ? i : 7 - i) * 0.15} />
      ))}
    </svg>
  )
}

export default function Sidebar({ mobileOpen = false, onClose = () => {} }) {
  const [collapsed, setCollapsed] = useState(false)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const role = user.role || 'viewer'
  const plan = user.plan || 'pro'
  const baseItems = NAV_BY_ROLE[role] || NAV_BY_ROLE.viewer
  const navItems = (role === 'admin' || role === 'agent')
    ? plan === 'free'
      ? [...baseItems.filter(i => i.to !== '/campaigns' && i.to !== '/prospects'),
         { to: '/demo', label: 'Llamada Demo', Icon: PhoneIcon },
         ...baseItems.filter(i => i.to === '/campaigns' || i.to === '/prospects')]
      : [...baseItems, { to: '/demo', label: 'Llamada Demo', Icon: PhoneIcon }]
    : baseItems
  const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 md:hidden" onClick={onClose} />
      )}
    <aside className={`
      fixed md:sticky top-0 inset-y-0 left-0 z-50
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0
      ${collapsed ? 'md:w-16' : 'md:w-60'} w-60
      bg-sidebar flex flex-col h-screen
      transition-transform md:transition-all duration-200 flex-shrink-0 border-r border-z-border
    `}>
      <div className={`flex items-center ${collapsed ? 'justify-center px-0' : 'gap-2.5 px-5'} py-4 border-b border-z-border min-h-[60px]`}>
        <WaveformIcon className="w-7 h-7 text-z-blue flex-shrink-0" />
        {!collapsed && (
          <>
            <div className="w-px h-6 bg-z-border mx-1 flex-shrink-0" />
            <span className="font-black text-lg leading-none tracking-tight">
              <span className="text-white">Zyra</span><span className="text-z-blue-light">Voice</span>
            </span>
          </>
        )}
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, label, Icon }) => (
          <NavLink
            key={to + label}
            to={to}
            end={to === '/dashboard'}
            title={collapsed ? label : undefined}
            onClick={onClose}
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
    </>
  )
}
