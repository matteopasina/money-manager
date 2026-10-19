import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Transactions from '../pages/Transactions'
import { api } from '../api/client'
vi.mock('../api/client', () => ({ api: {
  transactions: { list: vi.fn(), updateCategory: vi.fn() }, categories: { list: vi.fn() },
  accounts: { list: vi.fn() }, settings: { all: vi.fn() },
} }))
vi.mock('../components/MoneyChart', () => ({ default: () => <div>Chart</div> }))
vi.mock('../useTheme', () => ({ useTheme: () => ({ isDark: false }) }))
beforeEach(() => {
  vi.mocked(api.transactions.list).mockResolvedValue([
    { id: 1, account_id: 1, account: 'Bank', date: '2026-09-01', description: 'Market', amount: -100, amount_base: -80, category: null, value_date: null, reference: null, balance: null, notes: null },
    { id: 2, account_id: 1, account: 'Bank', date: '2026-09-01', description: 'Train', amount: -20, amount_base: -20, category: 'Transport', value_date: null, reference: null, balance: null, notes: null },
  ])
  vi.mocked(api.categories.list).mockResolvedValue([{ id: 1, name: 'Groceries', color: '#777', is_income: false, is_transfer: false }])
  vi.mocked(api.accounts.list).mockResolvedValue([{ id: 1, name: 'Bank', account_type: 'liquid', currency: 'USD', active: true }])
  vi.mocked(api.settings.all).mockResolvedValue({ base_currency: 'EUR' })
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
describe('transaction editing', () => {
  it('opens uncategorized transactions directly from the dashboard link', async () => {
    render(<MemoryRouter initialEntries={['/transactions?uncategorized=1']}><Transactions /></MemoryRouter>)
    expect(await screen.findByText('Market')).toBeInTheDocument()
    expect(screen.queryByText('Train')).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filtra per categoria' }), '')
    expect(screen.getByText('Train')).toBeInTheDocument()
  })
  it('keeps a historical category visible when opened from a chart', async () => {
    render(<MemoryRouter initialEntries={['/transactions?category=Transport']}><Transactions /></MemoryRouter>)
    expect(await screen.findByText('Train')).toBeInTheDocument()
    expect(screen.queryByText('Market')).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filtra per categoria' })).toHaveValue('Transport')
    expect(screen.getByRole('option', { name: 'Transport (categoria non presente)' })).toBeInTheDocument()
  })
  it('retains a category after a failed save and lets the user retry', async () => {
    vi.mocked(api.transactions.updateCategory).mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValueOnce(undefined)
    render(<MemoryRouter><Transactions /></MemoryRouter>)
    await userEvent.click(await screen.findByRole('button', { name: 'Modifica categoria per Market' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Categoria del movimento' }), 'Groceries')
    await userEvent.click(screen.getByRole('button', { name: 'Salva categoria' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection lost')
    expect(screen.getByRole('combobox', { name: 'Categoria del movimento' })).toHaveValue('Groceries')
    await userEvent.click(screen.getByRole('button', { name: 'Salva categoria' }))
    expect(await screen.findByRole('button', { name: 'Modifica categoria per Market' })).toBeInTheDocument()
    expect(api.transactions.updateCategory).toHaveBeenLastCalledWith(1, 'Groceries')
  })
})
