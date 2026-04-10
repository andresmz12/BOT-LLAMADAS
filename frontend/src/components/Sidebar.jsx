import { NavLink } from 'react-router-dom'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon
} from '@heroicons/react/24/outline'

const navItems = [
  { to: '/', label: 'Dashboard', Icon: HomeIcon },
  { to: '/agents', label: 'Agentes', Icon: UserGroupIcon },
  { to: '/campaigns', label: 'Campañas', Icon: MegaphoneIcon },
  { to: '/prospects', label: 'Prospectos', Icon: UsersIcon },
  { to: '/calls', label: 'Llamadas', Icon: PhoneIcon },
  { to: '/settings', label: 'Configuración', Icon: Cog6ToothIcon },
]

export default function Sidebar() {
  return (
    <aside className="w-60 bg-sidebar flex flex-col h-screen sticky top-0">
      <div className="flex items-center gap-3 px-6 py-5 border-b border-white/10">
        <div className="w-8 h-8 bg-gold rounded-lg flex items-center justify-center">
          <span className="text-sidebar font-black text-sm">ISM</span>
        </div>
        <div className="leading-none">
          <div className="text-gold font-bold text-sm">Voice Agent</div>
          <div className="text-gray-500 text-xs">ISM Consulting</div>
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
      </nav>
      <div className="px-6 py-4 border-t border-white/10">
        <p className="text-gray-600 text-xs">v1.0.0</p>
      </div>
    </aside>
  )
}
