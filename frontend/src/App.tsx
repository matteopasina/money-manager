import { BrowserRouter, NavLink, Routes, Route, Navigate } from 'react-router-dom'
import {
  LayoutDashboard, PlusCircle, UploadCloud, Settings,
  BarChart2, Target, Receipt, Tag, Archive, Wallet,
} from 'lucide-react'
import './styles/globals.css'
import ChatSidebar from './components/ChatSidebar'
import Dashboard from './pages/Dashboard'
import AddBalance from './pages/AddBalance'
import Transactions from './pages/Transactions'
import Accounts from './pages/Accounts'
import Import from './pages/Import'
import ManageBalances from './pages/ManageBalances'
import Predictions from './pages/Predictions'
import GoalCalculator from './pages/GoalCalculator'
import Categories from './pages/Categories'

const NAV_OVERVIEW = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: Receipt,         label: 'Transactions' },
  { to: '/predictions',  icon: BarChart2,       label: 'Predictions' },
  { to: '/goal-calculator', icon: Target,       label: 'Goal Calculator' },
]

const NAV_MANAGE = [
  { to: '/add-balance',     icon: PlusCircle,  label: 'Add Balance' },
  { to: '/import',          icon: UploadCloud, label: 'Import' },
  { to: '/manage-balances', icon: Archive,     label: 'Manage Balances' },
]

const NAV_SETTINGS = [
  { to: '/categories', icon: Tag,      label: 'Categories' },
  { to: '/accounts',   icon: Settings, label: 'Accounts & FX' },
]

function NavGroup({ label, items }: { label: string; items: typeof NAV_OVERVIEW }) {
  return (
    <>
      <div className="nav-section-label">{label}</div>
      {items.map(({ to, icon: Icon, label: l }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
        >
          <Icon size={15} />
          {l}
        </NavLink>
      ))}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="layout">
        <nav className="sidebar">
          <div className="nav-brand">
            <Wallet size={18} color="var(--accent)" />
            Money Manager
          </div>
          <NavGroup label="Overview" items={NAV_OVERVIEW} />
          <NavGroup label="Manage" items={NAV_MANAGE} />
          <NavGroup label="Settings" items={NAV_SETTINGS} />
          <ChatSidebar />
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"       element={<Dashboard />} />
            <Route path="/add-balance"     element={<AddBalance />} />
            <Route path="/transactions"    element={<Transactions />} />
            <Route path="/predictions"     element={<Predictions />} />
            <Route path="/goal-calculator" element={<GoalCalculator />} />
            <Route path="/import"          element={<Import />} />
            <Route path="/manage-balances" element={<ManageBalances />} />
            <Route path="/categories"      element={<Categories />} />
            <Route path="/accounts"        element={<Accounts />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
