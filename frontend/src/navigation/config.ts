import { LayoutDashboard, Receipt, Wallet, TrendingUp, PiggyBank, Sparkles, Settings } from 'lucide-react'

// Change order and labels here; route ownership also drives mobile titles.
export const primaryNavigation = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Il tuo quadro' },
  { to: '/transactions', icon: Receipt, label: 'Movimenti' },
  { to: '/wealth', icon: Wallet, label: 'Patrimonio' },
  { to: '/budgets', icon: PiggyBank, label: 'Budget' },
  { to: '/projections', icon: TrendingUp, label: 'Futuro' },
  { to: '/financial-helper', icon: Sparkles, label: 'Assistente' },
]
export const settingsNavigation = [{ to: '/settings', icon: Settings, label: 'Impostazioni' }]
export const wealthSections = [
  { to: '/wealth', label: 'Vista d’insieme', end: true },
  { to: '/wealth/accounts', label: 'Conti e saldi' },
  { to: '/wealth/investments', label: 'Investimenti' },
]
export const activitySections = [
  { to: '/transactions', label: 'Movimenti', end: true },
  { to: '/transactions/categories', label: 'Categorie e regole' },
]
export const settingsSections = [
  { to: '/settings/connections', label: 'Connessioni' },
  { to: '/settings/currencies', label: 'Valute e cambi' },
  { to: '/settings/preferences', label: 'Preferenze' },
]
export const futureSections = [
  { to: '/projections', label: 'Previsioni', end: true },
  { to: '/projections/goals', label: 'Obiettivi' },
]
export const legacyDestinations: Record<string, string> = {
  '/balances': '/wealth/accounts', '/accounts': '/wealth/accounts',
  '/add-balance': '/wealth/accounts?action=add', '/manage-balances': '/wealth/accounts',
  '/categories': '/transactions/categories',
  '/connections': '/settings/connections', '/integrations': '/settings/connections',
  '/preferences': '/settings/preferences',
  '/predictions': '/projections', '/goal-calculator': '/projections/goals',
  '/assistant': '/financial-helper',
}

export function navigationOwner(pathname: string, search = '') {
  const path = pathname === '/import'
    ? new URLSearchParams(search).get('type') === 'balances' ? '/wealth' : '/transactions'
    : pathname
  return [...primaryNavigation, ...settingsNavigation].find(item => path === item.to || path.startsWith(item.to + '/'))
}
