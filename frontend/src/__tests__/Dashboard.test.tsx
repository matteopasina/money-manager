import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import Dashboard from '../pages/Dashboard'
import { api, type TransactionRow } from '../api/client'
vi.mock('../api/client', () => ({ api: {
  balances: { list: vi.fn() }, transactions: { list: vi.fn() }, categories: { list: vi.fn() },
  settings: { all: vi.fn() }, budgets: { list: vi.fn() }, sync: { status: vi.fn() },
} }))
function Location() { const location = useLocation(); return <output data-testid="location">{location.pathname}{JSON.stringify(location.state)}</output> }
const row = (id: number, date: string, amount: number, description = 'Market'): TransactionRow => ({ id, account_id: 1, account: 'Bank', date, description, amount, amount_base: amount, category: null, value_date: null, reference: null, balance: null, notes: null })
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-07T12:00:00'))
  vi.mocked(api.balances.list).mockResolvedValue([])
  vi.mocked(api.transactions.list).mockResolvedValue([row(1, '2026-08-01', -80)])
  vi.mocked(api.categories.list).mockResolvedValue([])
  vi.mocked(api.settings.all).mockResolvedValue({ base_currency: 'USD' })
  vi.mocked(api.budgets.list).mockRejectedValue(new Error('Unavailable'))
  vi.mocked(api.sync.status).mockRejectedValue(new Error('Unavailable'))
})
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.useRealTimers() })
describe('modular home', () => {
  it('keeps monthly data usable without balances or optional services and navigates to the exact cleanup period', async () => {
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    expect(await screen.findByText('Parti da quello che hai.')).toBeInTheDocument()
    expect(screen.getByText('Nessuna spesa registrata per questo mese.')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mese' }), '2026-08')
    expect(screen.getByText(/Le spese superano le entrate registrate/)).toBeInTheDocument()
    expect(screen.getAllByText(/\$80/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/€/)).not.toBeInTheDocument()
    expect(await screen.findByText(/Budget non disponibili/)).toBeInTheDocument()
    expect(await screen.findByText(/Stato connessioni non disponibile/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 movimento da classificare/ })).toHaveAttribute('href', '/transactions?uncategorized=1&start=2026-08-01&end=2026-08-31')
  })
  it('offers a working retry after a core data failure', async () => {
    vi.mocked(api.balances.list).mockRejectedValueOnce(new Error('Offline')).mockResolvedValue([])
    render(<MemoryRouter><Dashboard /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Riprova' }))
    expect(await screen.findByText('Parti da quello che hai.')).toBeInTheDocument()
  })
  it('shows a forecast only for the current month and passes a question to the assistant', async () => {
    vi.mocked(api.transactions.list).mockResolvedValue([row(1, '2026-07-27', 3000, 'Stipendio'), row(2, '2026-08-27', 3000, 'Stipendio'), row(3, '2026-09-03', -100)])
    render(<MemoryRouter><Dashboard /><Location /></MemoryRouter>)
    expect(await screen.findByText('Saldo previsto a fine mese')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /1 movimento da classificare/ })).toHaveAttribute('href', '/transactions?uncategorized=1&start=2026-09-01&end=2026-09-07')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Mese' }), '2026-08')
    expect(screen.queryByText('Saldo previsto a fine mese')).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Il tuo mese' })).getByText('Saldo del mese registrato')).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: 'Chiedi a Fuoco' }), 'Come sono cambiate le spese?')
    await userEvent.click(screen.getByRole('button', { name: 'Invia domanda all’assistente' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/financial-helper{"prompt":"Come sono cambiate le spese?","sourcePath":"/dashboard?month=2026-08"}')
  })
})
