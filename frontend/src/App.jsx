import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { Bars3Icon } from '@heroicons/react/24/outline'
import Sidebar from './components/Sidebar'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Campaigns from './pages/Campaigns'
import Prospects from './pages/Prospects'
import Calls from './pages/Calls'
import Settings from './pages/Settings'
import Admin from './pages/Admin'
import DemoCall from './pages/DemoCall'
import WhatsApp from './pages/WhatsApp'
import Users from './pages/Users'
import Leads from './pages/Leads'
import EmailMarketing from './pages/EmailMarketing'
import LeadHunter from './pages/LeadHunter'

const IDLE_MS = 5 * 60 * 1000 // 5 minutes

function ProtectedLayout() {
  const token = localStorage.getItem('token')
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    if (!token) return

    const doLogout = () => {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      navigate('/login', { replace: true })
    }

    // Logout after 5 min of inactivity inside the app
    let timer
    const reset = () => {
      clearTimeout(timer)
      timer = setTimeout(doLogout, IDLE_MS)
    }
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      clearTimeout(timer)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [token])

  if (!token) return <Navigate to="/login" replace />
  return (
    <div className="flex min-h-screen bg-z-bg">
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-sidebar border-b border-z-border flex items-center px-4 h-14">
        <button onClick={() => setMobileOpen(true)} className="p-1 text-slate-400 hover:text-slate-200">
          <Bars3Icon className="w-6 h-6" />
        </button>
        <span className="ml-3 font-black text-base leading-none">
          <span className="text-white">Zyra</span><span className="text-z-blue-light">Voice</span>
        </span>
      </div>
      <div className="md:hidden h-14 w-full fixed top-0 pointer-events-none" />

      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/campaigns" element={<Campaigns />} />
          <Route path="/prospects" element={<Prospects />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/demo" element={<DemoCall />} />
          <Route path="/chatbot" element={<WhatsApp />} />
          <Route path="/team" element={<Users />} />
          <Route path="/leads" element={<Leads />} />
          <Route path="/email-marketing" element={<EmailMarketing />} />
          <Route path="/lead-hunter" element={<LeadHunter />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
