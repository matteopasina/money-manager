import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Receipt, Wallet, UploadCloud,
  TrendingUp, Tag, Settings, Plug, SlidersHorizontal, PiggyBank,
  Sparkles, Menu, X,
} from 'lucide-react'
import { ThemeProvider } from './ThemeContext'
import fuocoLogo from './assets/fuoco-logo.png'
import fuocoWordmark from './assets/fuoco-wordmark.png'
import './styles/globals.css'
import Dashboard from './pages/Dashboard'
import FinancialHelper from './pages/FinancialHelper'
import Transactions from './pages/Transactions'
import Balances from './pages/Balances'
import Import from './pages/Import'
import Projections from './pages/Projections'
import Budgets from './pages/Budgets'
import Accounts from './pages/Accounts'
import Categories from './pages/Categories'
import Connections from './pages/Connections'
import Preferences from './pages/Preferences'

const NAV_OVERVIEW = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/financial-helper', icon: Sparkles, label: 'Financial Helper' },
]

const NAV_ACTIVITY = [
  { to: '/transactions', icon: Receipt,     label: 'Transactions' },
  { to: '/balances',     icon: Wallet,      label: 'Balances' },
  { to: '/import',       icon: UploadCloud, label: 'Import' },
]

const NAV_PLAN = [
  { to: '/budgets',      icon: PiggyBank,  label: 'Budgets' },
  { to: '/projections',  icon: TrendingUp, label: 'Projections' },
]

const NAV_SETUP = [
  { to: '/accounts',     icon: Settings,          label: 'Accounts & FX' },
  { to: '/categories',   icon: Tag,               label: 'Categories & Rules' },
  { to: '/connections',  icon: Plug,              label: 'Connections' },
  { to: '/preferences',  icon: SlidersHorizontal, label: 'Preferences' },
]

function NavGroup({
  label,
  items,
  onNavigate,
}: {
  label: string
  items: typeof NAV_OVERVIEW
  onNavigate?: () => void
}) {
  return (
    <div className="nav-group">
      <div className="nav-section-label">{label}</div>
      {items.map(({ to, icon: Icon, label: l }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
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

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      <div className="nav-brand">
        <img className="nav-brand-mark" src={fuocoLogo} alt="" />
        <img className="nav-brand-wordmark" src={fuocoWordmark} alt="FUOCO" />
      </div>
      <NavGroup label="Overview" items={NAV_OVERVIEW} onNavigate={onNavigate} />
      <NavGroup label="Activity" items={NAV_ACTIVITY} onNavigate={onNavigate} />
      <NavGroup label="Plan" items={NAV_PLAN} onNavigate={onNavigate} />
      <NavGroup label="Setup" items={NAV_SETUP} onNavigate={onNavigate} />
    </>
  )
}

function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()

  const currentLabel = [...NAV_OVERVIEW, ...NAV_ACTIVITY, ...NAV_PLAN, ...NAV_SETUP]
    .find(item => item.to === location.pathname)?.label ?? 'FUOCO'

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  useEffect(() => {
    closeMobileNav()
  }, [location.pathname])

  useEffect(() => {
    if (!mobileNavOpen) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMobileNav()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileNavOpen])

  return (
    <div className="layout">
      <header className="mobile-topbar">
        <div className="mobile-brand">
          <img className="mobile-brand-mark" src={fuocoLogo} alt="" />
          <img className="mobile-brand-wordmark" src={fuocoWordmark} alt="FUOCO" />
        </div>
        <div className="mobile-route-label">{currentLabel}</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(open => !open)}
        >
          {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      <nav className="sidebar">
        <Sidebar />
      </nav>

      <div
        className={`mobile-nav-backdrop${mobileNavOpen ? ' open' : ''}`}
        onClick={closeMobileNav}
        aria-hidden="true"
      />
      <nav
        className={`mobile-sidebar${mobileNavOpen ? ' open' : ''}`}
        aria-label="Mobile navigation"
        aria-hidden={!mobileNavOpen}
      >
        <Sidebar onNavigate={closeMobileNav} />
      </nav>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/financial-helper" element={<FinancialHelper />} />
          <Route path="/transactions"    element={<Transactions />} />
          <Route path="/balances"        element={<Balances />} />
          <Route path="/import"          element={<Import />} />
          <Route path="/projections"     element={<Projections />} />
          <Route path="/budgets"         element={<Budgets />} />
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
          <Route path="/assistant"        element={<Navigate to="/financial-helper" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </ThemeProvider>
  )
}
