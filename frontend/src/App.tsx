import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, Receipt, Wallet, UploadCloud,
  TrendingUp, Tag, Settings, Plug, SlidersHorizontal,
} from 'lucide-react'
import { ThemeProvider } from './ThemeContext'
import { api } from './api/client'
import './styles/globals.css'
import ChatSidebar from './components/ChatSidebar'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Balances from './pages/Balances'
import Import from './pages/Import'
import Projections from './pages/Projections'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Connections from './pages/Connections'
import Preferences from './pages/Preferences'

const NAV_OVERVIEW = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
]

const NAV_ACTIVITY = [
  { to: '/transactions', icon: Receipt,     label: 'Transactions' },
  { to: '/balances',     icon: Wallet,      label: 'Balances' },
  { to: '/import',       icon: UploadCloud, label: 'Import' },
]

const NAV_PLAN = [
  { to: '/projections',  icon: TrendingUp, label: 'Projections' },
]

const NAV_SETUP = [
  { to: '/accounts',     icon: Settings,          label: 'Accounts & FX' },
  { to: '/categories',   icon: Tag,               label: 'Categories & Rules' },
  { to: '/connections',  icon: Plug,              label: 'Connections' },
  { to: '/preferences',  icon: SlidersHorizontal, label: 'Preferences' },
]

function NavGroup({ label, items }: { label: string; items: typeof NAV_OVERVIEW }) {
  return (
    <div className="nav-group">
      <div className="nav-section-label">{label}</div>
      {items.map(({ to, icon: Icon, label: l }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <span className="nav-link-dot" />
          {l}
          <Icon size={14} style={{ marginLeft: 'auto', opacity: 0.6, flexShrink: 0 }} />
        </NavLink>
      ))}
    </div>
  )
}

export default function App() {
  const [baseCurrency, setBaseCurrency] = useState('EUR')

  useEffect(() => {
    api.settings.all().then(s => setBaseCurrency(s.base_currency || 'EUR')).catch(() => {})
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="layout">
          <nav className="sidebar">
            <div className="nav-brand">
              <div className="nav-brand-mark">m</div>
              <div className="nav-brand-word">Money Manager</div>
            </div>
            <NavGroup label="Overview" items={NAV_OVERVIEW} />
            <NavGroup label="Activity" items={NAV_ACTIVITY} />
            <NavGroup label="Plan" items={NAV_PLAN} />
            <NavGroup label="Setup" items={NAV_SETUP} />

            <div className="sidebar-user">
              <div className="sidebar-user-card">
                <div className="sidebar-user-avatar">M</div>
                <div style={{ minWidth: 0 }}>
                  <div className="sidebar-user-name">Personal account</div>
                  <div className="sidebar-user-sub">Base currency · {baseCurrency}</div>
                </div>
              </div>
            </div>
          </nav>

          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard"       element={<Dashboard />} />
              <Route path="/transactions"    element={<Transactions />} />
              <Route path="/balances"        element={<Balances />} />
              <Route path="/import"          element={<Import />} />
              <Route path="/projections"     element={<Projections />} />
              <Route path="/accounts"        element={<Accounts />} />
              <Route path="/categories"      element={<Categories />} />
              <Route path="/connections"     element={<Connections />} />
              <Route path="/preferences"     element={<Preferences />} />

              {/* Old routes, kept as redirects for stale bookmarks/tabs */}
              <Route path="/add-balance"     element={<Navigate to="/balances" replace />} />
              <Route path="/manage-balances" element={<Navigate to="/balances" replace />} />
              <Route path="/predictions"     element={<Navigate to="/projections" replace />} />
              <Route path="/goal-calculator" element={<Navigate to="/projections" replace />} />
              <Route path="/integrations"    element={<Navigate to="/connections" replace />} />
              <Route path="/settings"        element={<Navigate to="/preferences" replace />} />
            </Routes>
          </main>
          <ChatSidebar />
        </div>
      </BrowserRouter>
    </ThemeProvider>
  )
}
