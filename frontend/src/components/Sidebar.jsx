import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  HomeIcon, UserGroupIcon, MegaphoneIcon,
  UsersIcon, PhoneIcon, Cog6ToothIcon,
  KeyIcon, ArrowRightOnRectangleIcon,
  ChevronLeftIcon, ChevronRightIcon,
  ChatBubbleLeftRightIcon, FireIcon, EnvelopeIcon,
  MagnifyingGlassIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import { logout } from '../api/client'

const NAV_BY_ROLE = {
  superadmin: [
    { to: '/dashboard', labelKey: 'sidebar.dashboard', Icon: HomeIcon },
    { to: '/admin', labelKey: 'sidebar.admin', Icon: KeyIcon },
    { to: '/marketing', labelKey: 'sidebar.marketing', Icon: SparklesIcon },
    { to: '/chatbot', labelKey: 'sidebar.chatbot', Icon: ChatBubbleLeftRightIcon },
    { to: '/settings', labelKey: 'sidebar.settings', Icon: Cog6ToothIcon },
  ],
  admin: [
    { to: '/dashboard', labelKey: 'sidebar.dashboard', Icon: HomeIcon },
    { to: '/leads', labelKey: 'sidebar.leads', Icon: FireIcon },
    { to: '/lead-hunter', labelKey: 'sidebar.leadHunter', Icon: MagnifyingGlassIcon },
    { to: '/agents', labelKey: 'sidebar.agents', Icon: UserGroupIcon },
    { to: '/campaigns', labelKey: 'sidebar.campaigns', Icon: MegaphoneIcon },
    { to: '/prospects', labelKey: 'sidebar.prospects', Icon: UsersIcon },
    { to: '/calls', labelKey: 'sidebar.calls', Icon: PhoneIcon },
    { to: '/email-marketing', labelKey: 'sidebar.emailMarketing', Icon: EnvelopeIcon },
    { to: '/marketing', labelKey: 'sidebar.marketing', Icon: SparklesIcon },
    { to: '/chatbot', labelKey: 'sidebar.chatbot', Icon: ChatBubbleLeftRightIcon },
    { to: '/team', labelKey: 'sidebar.team', Icon: UsersIcon },
    { to: '/settings', labelKey: 'sidebar.settings', Icon: Cog6ToothIcon },
  ],
  agent: [
    { to: '/dashboard', labelKey: 'sidebar.dashboard', Icon: HomeIcon },
    { to: '/leads', labelKey: 'sidebar.leads', Icon: FireIcon },
    { to: '/lead-hunter', labelKey: 'sidebar.leadHunter', Icon: MagnifyingGlassIcon },
    { to: '/campaigns', labelKey: 'sidebar.campaigns', Icon: MegaphoneIcon },
    { to: '/prospects', labelKey: 'sidebar.prospects', Icon: UsersIcon },
    { to: '/calls', labelKey: 'sidebar.calls', Icon: PhoneIcon },
    { to: '/email-marketing', labelKey: 'sidebar.emailMarketing', Icon: EnvelopeIcon },
    { to: '/chatbot', labelKey: 'sidebar.chatbot', Icon: ChatBubbleLeftRightIcon },
  ],
  viewer: [
    { to: '/dashboard', labelKey: 'sidebar.dashboard', Icon: HomeIcon },
    { to: '/calls', labelKey: 'sidebar.calls', Icon: PhoneIcon },
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
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState(false)
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const role = user.role || 'viewer'
  const plan = user.plan || 'pro'
  const marketingEnabled = user.marketing_enabled || false
  // Modules a superadmin can turn off per organization — hide the nav entry
  // whenever the flag is explicitly false. Strict `=== false` (not `!value`)
  // so a stale cached `user` object from before these flags existed (value
  // undefined) still shows everything, matching what that org already had.
  const moduleOff = (field) => role !== 'superadmin' && user[field] === false
  const baseItems = (NAV_BY_ROLE[role] || NAV_BY_ROLE.viewer)
    .filter(item => item.to !== '/marketing' || role === 'superadmin' || marketingEnabled)
    .filter(item => item.to !== '/email-marketing' || !moduleOff('email_marketing_enabled'))
    .filter(item => item.to !== '/lead-hunter' || !moduleOff('lead_hunter_enabled'))
    .filter(item => item.to !== '/chatbot' || !moduleOff('whatsapp_module_enabled'))
  const isLimitedPlan = plan === 'free' || plan === 'starter'
  const navItems = (role === 'admin' || role === 'agent')
    ? isLimitedPlan
      ? [...baseItems.filter(i => i.to !== '/campaigns' && i.to !== '/lead-hunter' && i.to !== '/prospects'),
         { to: '/demo', labelKey: 'sidebar.demoCall', Icon: PhoneIcon }]
      : [...baseItems, { to: '/demo', labelKey: 'sidebar.demoCall', Icon: PhoneIcon }]
    : baseItems
  const initials = (user.full_name || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  // Some accounts (e.g. a shared org login) have full_name set to the
  // company's own name, which then nearly duplicates organization_name right
  // below it — showing both stacked just repeats the same truncated text
  // twice. Only show the org line when it actually adds information.
  const orgName = user.organization_name || ''
  const showOrgName = orgName && !orgName.toLowerCase().startsWith((user.full_name || '').toLowerCase())

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
        {user.logo_url ? (
          <img src={user.logo_url} alt={orgName || 'Logo'} className="w-7 h-7 rounded object-contain flex-shrink-0" />
        ) : (
          <WaveformIcon className="w-7 h-7 text-z-blue flex-shrink-0" />
        )}
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
        {navItems.map(({ to, labelKey, Icon }) => (
          <div key={to + labelKey}>
            <NavLink
              to={to}
              end={to === '/dashboard'}
              title={collapsed ? t(labelKey) : undefined}
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
              {!collapsed && t(labelKey)}
            </NavLink>
            {to === '/lead-hunter' && !collapsed && (role === 'admin' || role === 'superadmin') && (
              <NavLink
                to="/lead-hunter/config"
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-2 pl-11 pr-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-z-blue-light'
                      : 'text-slate-600 hover:text-slate-300 hover:bg-white/5'
                  }`
                }
              >
                <Cog6ToothIcon className="w-3.5 h-3.5 flex-shrink-0" /> {t('sidebar.leadHunterConfig')}
              </NavLink>
            )}
          </div>
        ))}
      </nav>

      <div className="px-2 py-3 border-t border-z-border space-y-2">
        {!collapsed && (
          <div className="flex items-center gap-2.5 px-3 py-2">
            <div className="w-7 h-7 bg-z-blue/20 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-z-blue-light font-bold text-xs">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-slate-200 text-xs font-medium truncate" title={user.full_name || ''}>{user.full_name || 'Usuario'}</div>
              {showOrgName && (
                <div className="text-slate-500 text-xs truncate" title={orgName}>{orgName}</div>
              )}
            </div>
          </div>
        )}
        <button
          onClick={logout}
          title={t('sidebar.logout')}
          className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2'} w-full px-3 py-2 text-xs text-slate-500 hover:text-red-400 rounded-lg hover:bg-white/5 transition-colors`}
        >
          <ArrowRightOnRectangleIcon className="w-4 h-4 flex-shrink-0" />
          {!collapsed && t('sidebar.logout')}
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
