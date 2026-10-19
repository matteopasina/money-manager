import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { BrowserRouter, Link, NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { PixelFlame, PixelNavIcon, PixelVisitor } from './components/arcade/PixelArt'
import { Menu, X } from 'lucide-react'
import { primaryNavigation, settingsNavigation, wealthSections, activitySections, settingsSections, legacyDestinations, navigationOwner } from './navigation/config'
import LegacyRedirect from './navigation/LegacyRedirect'
import SectionLayout from './components/workspace/SectionLayout'
import { ThemeProvider } from './ThemeContext'
import fuocoLogo from './assets/fuoco-logo.png'
import fuocoWordmark from './assets/fuoco-wordmark.png'
import './styles/globals.css'
import './styles/workspace.css'
import './styles/home.css'
import './styles/arcade.css'
import LoadingSpinner from './components/LoadingSpinner'
const Dashboard = lazy(() => import('./pages/Dashboard'))
const FinancialHelper = lazy(() => import('./pages/FinancialHelper'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Import = lazy(() => import('./pages/Import'))
const Projections = lazy(() => import('./pages/Projections'))
const Predictions = lazy(() => import('./pages/Predictions'))
const GoalCalculator = lazy(() => import('./pages/GoalCalculator'))
const WealthOverview = lazy(() => import('./pages/wealth/WealthOverview'))
const WealthAccounts = lazy(() => import('./pages/wealth/WealthAccounts'))
const Investments = lazy(() => import('./pages/wealth/Investments'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Categories = lazy(() => import('./pages/Categories'))
const Connections = lazy(() => import('./pages/Connections'))
const Preferences = lazy(() => import('./pages/Preferences'))

const DesignSystem = lazy(() => import('./pages/DesignSystem'))

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation()
  const owner = navigationOwner(location.pathname, location.search)
  return <>
    <div className="nav-brand">
      <img className="nav-brand-mark" src={fuocoLogo} alt="" />
      <img className="nav-brand-wordmark" src={fuocoWordmark} alt="FUOCO" /><span className="arcade-brand"><PixelFlame /><span>fuoco</span></span>
    </div>
    <div className="nav-primary">{primaryNavigation.map(({ to, icon: Icon, label }) =>
      <Link key={to} to={to} onClick={onNavigate} aria-current={owner?.to === to ? 'page' : undefined} className={`nav-link${owner?.to === to ? ' active' : ''}`}>
        <Icon className="editorial-nav-icon" size={19} aria-hidden="true" /><PixelNavIcon path={to} />{label}
      </Link>)}</div>
    <div className="nav-footer"><PixelVisitor />{settingsNavigation.map(({ to, icon: Icon, label }) =>
      <Link key={to} to={to} onClick={onNavigate} aria-current={owner?.to === to ? 'page' : undefined} className={`nav-link${owner?.to === to ? ' active' : ''}`}>
        <Icon className="editorial-nav-icon" size={19} aria-hidden="true" /><PixelNavIcon path={to} />{label}
      </Link>)}<p>Un po’ più di spazio, ogni giorno.</p></div>
  </>
}

export function AppShell() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const location = useLocation()
  const [navPath, setNavPath] = useState(location.pathname)
  const main = useRef<HTMLElement>(null)
  const menuButton = useRef<HTMLButtonElement>(null)
  const drawer = useRef<HTMLDivElement>(null)
  if (navPath !== location.pathname) {
    setNavPath(location.pathname)
    setMobileNavOpen(false)
  }

  const currentLabel = location.pathname === '/import' ? 'Importa dati' : navigationOwner(location.pathname, location.search)?.label ?? 'FUOCO'

  useEffect(() => { main.current?.scrollTo?.({ top: 0 }) }, [location.pathname])

  function closeMobileNav() {
    setMobileNavOpen(false)
  }

  useEffect(() => {
    if (!mobileNavOpen) return
    const trigger = menuButton.current
    const links = drawer.current?.querySelectorAll<HTMLElement>('a, button')
    links?.[0]?.focus()
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') closeMobileNav()
      if (event.key !== 'Tab' || !links?.length) return
      const first = links[0], last = links[links.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    const desktop = window.matchMedia('(min-width: 921px)')
    function onResize() { if (desktop.matches) closeMobileNav() }
    desktop.addEventListener('change', onResize)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      desktop.removeEventListener('change', onResize)
      window.removeEventListener('keydown', onKeyDown)
      trigger?.focus()
    }
  }, [mobileNavOpen])

  return (
    <div className="layout">
      <header className="mobile-topbar" inert={mobileNavOpen}>
        <div className="mobile-brand">
          <img className="mobile-brand-mark" src={fuocoLogo} alt="" />
          <img className="mobile-brand-wordmark" src={fuocoWordmark} alt="FUOCO" /><span className="arcade-brand"><PixelFlame /><span>fuoco</span></span>
        </div>
        <div className="mobile-route-label">{currentLabel}</div>
        <button
          type="button"
          className="mobile-menu-button"
          aria-label={mobileNavOpen ? 'Chiudi navigazione' : 'Apri navigazione'}
          ref={menuButton}
          aria-controls="mobile-navigation"
          aria-expanded={mobileNavOpen}
          onClick={() => setMobileNavOpen(open => !open)}
        >
          {mobileNavOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      <nav className="sidebar" aria-label="Navigazione principale" inert={mobileNavOpen}>
        <Sidebar />
      </nav>

      <div
        className={`mobile-nav-backdrop${mobileNavOpen ? ' open' : ''}`}
        onClick={closeMobileNav}
        aria-hidden="true"
      />
      {mobileNavOpen && <div
        ref={drawer}
        id="mobile-navigation"
        className="mobile-sidebar open"
        role="dialog"
        aria-modal="true"
        aria-label="Navigazione"
      >
        <button className="mobile-menu-button drawer-close" aria-label="Chiudi navigazione" onClick={closeMobileNav}><X size={19} /></button>
        <nav aria-label="Navigazione mobile"><Sidebar onNavigate={closeMobileNav} /></nav>
      </div>}

      <main ref={main} className="main-content" inert={mobileNavOpen}>
        <Suspense fallback={<LoadingSpinner />}><Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/design-system" element={<DesignSystem />} />
          <Route path="/dashboard"       element={<Dashboard />} />
          <Route path="/financial-helper" element={<FinancialHelper />} />
          <Route element={<SectionLayout title="Movimenti" description="Quello che entra, quello che esce. Tutto al suo posto." sections={activitySections} />}>
            <Route path="/transactions" element={<Transactions embedded />} />
            <Route path="/transactions/categories" element={<Categories embedded />} />
          </Route>
          <Route element={<SectionLayout title="Patrimonio" description="I tuoi conti, i tuoi investimenti e la strada fatta fin qui." sections={wealthSections} />}>
            <Route path="/wealth" element={<WealthOverview />} />
            <Route path="/wealth/accounts" element={<WealthAccounts />} />
            <Route path="/wealth/investments" element={<Investments />} />
          </Route>
          <Route element={<Projections />}>
            <Route path="/projections" element={<Predictions />} />
            <Route path="/projections/goals" element={<GoalCalculator />} />
          </Route>
          <Route element={<SectionLayout title="Impostazioni" description="Collega i conti e scegli come usare Fuoco." sections={settingsSections} />}>
            <Route path="/settings" element={<LegacyRedirect to="/settings/preferences" />} />
            <Route path="/settings/connections" element={<Connections embedded />} />
            <Route path="/settings/currencies" element={<Accounts mode="currencies" embedded />} />
            <Route path="/settings/preferences" element={<Preferences embedded />} />
          </Route>
          <Route path="/import" element={<Import />} />
          <Route path="/budgets" element={<Budgets />} />
          {Object.entries(legacyDestinations).map(([from, to]) => <Route key={from} path={from} element={<LegacyRedirect to={to} />} />)}
          <Route path="*" element={<div className="card"><h1>Pagina non trovata</h1><NavLink to="/dashboard">Torna al tuo quadro →</NavLink></div>} />
        </Routes></Suspense>
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
