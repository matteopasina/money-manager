import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { AppShell } from '../App'

// Route integration tests isolate presentation from API availability.
vi.mock('../pages/Transactions', () => ({ default: () => <h2>Elenco dei movimenti</h2> }))
vi.mock('../pages/Categories', () => ({ default: () => <h2>Editor categorie</h2> }))
vi.mock('../pages/wealth/WealthAccounts', () => ({ default: () => <h2>Editor conti e saldi</h2> }))
vi.mock('../pages/Preferences', () => ({ default: () => <h2>Preferenze utente</h2> }))
vi.mock('../pages/Connections', () => ({ default: () => <h2>Collegamenti bancari</h2> }))
vi.mock('../pages/GoalCalculator', () => ({ default: () => <h2>Calcola obiettivo</h2> }))
function History() { const l = useLocation(); const navigate = useNavigate(); return <><output data-testid="url">{l.pathname}{l.search}{l.hash}</output><button onClick={() => navigate(-1)}>Indietro</button></> }
function mount(path: string) { render(<MemoryRouter initialEntries={[path]}><AppShell /><History /></MemoryRouter>) }
beforeEach(() => { vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
it('has six primary links plus settings, with an active owner for nested pages', async () => {
  mount('/transactions/categories')
  expect(await screen.findByText('Editor categorie')).toBeInTheDocument()
  const links = within(screen.getByRole('navigation', { name: 'Navigazione principale' })).getAllByRole('link')
  expect(links.map(l => l.textContent)).toEqual(['Il tuo quadro', 'Movimenti', 'Patrimonio', 'Budget', 'Futuro', 'Assistente', 'Impostazioni'])
  expect(links[1]).toHaveAttribute('aria-current', 'page')
})
it.each([
  ['/add-balance?account_id=2', '/wealth/accounts?account_id=2&action=add', 'Editor conti e saldi'],
  ['/balances?account_id=2#record', '/wealth/accounts?account_id=2#record', 'Editor conti e saldi'],
  ['/connections?code=one-time&state=bbva', '/settings/connections?code=one-time&state=bbva', 'Collegamenti bancari'],
  ['/settings', '/settings/preferences', 'Preferenze utente'],
  ['/goal-calculator', '/projections/goals', 'Calcola obiettivo'],
])('preserves legacy intent for %s', async (from, to, heading) => {
  mount(from)
  expect(await screen.findByText(heading)).toBeInTheDocument()
  expect(screen.getByTestId('url')).toHaveTextContent(to)
})
it('restores the active section when going back', async () => {
  mount('/transactions')
  await screen.findByText('Elenco dei movimenti')
  await userEvent.click(screen.getByRole('link', { name: 'Categorie e regole' }))
  await screen.findByText('Editor categorie')
  await userEvent.click(screen.getByRole('button', { name: 'Indietro' }))
  expect(await screen.findByText('Elenco dei movimenti')).toBeInTheDocument()
  expect(within(screen.getByRole('navigation', { name: 'Sezioni Movimenti' })).getByRole('link', { name: 'Movimenti' })).toHaveAttribute('aria-current', 'page')
})
