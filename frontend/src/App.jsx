import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Campaigns from './pages/Campaigns'
import Prospects from './pages/Prospects'
import Calls from './pages/Calls'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/prospects" element={<Prospects />} />
            <Route path="/calls" element={<Calls />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
