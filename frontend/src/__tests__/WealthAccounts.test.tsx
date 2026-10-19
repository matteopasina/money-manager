import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import WealthAccounts from '../pages/wealth/WealthAccounts'
import { api, type Account } from '../api/client'
vi.mock('../api/client', () => ({ api: {
  accounts: { list: vi.fn(), fxRates: vi.fn(), create: vi.fn() },
  balances: { list: vi.fn() }, settings: { all: vi.fn() },
} }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('makes a new account available to the balance editor without losing a balance draft', async () => {
  const accounts: Account[] = [{ id: 1, name: 'Bank', currency: 'EUR', account_type: 'liquid', active: true }]
  vi.mocked(api.accounts.list).mockImplementation(async () => [...accounts])
  vi.mocked(api.accounts.fxRates).mockResolvedValue([])
  vi.mocked(api.settings.all).mockResolvedValue({ base_currency: 'EUR' })
  vi.mocked(api.balances.list).mockResolvedValue([])
  vi.mocked(api.accounts.create).mockImplementation(async body => { const a = { ...body, id: 2, active: true }; accounts.push(a); return a })
  render(<MemoryRouter><WealthAccounts /></MemoryRouter>)
  await userEvent.click(await screen.findByRole('button', { name: '+ Aggiungi saldo' }))
  await userEvent.type(screen.getByLabelText('Importo'), '123')
  await userEvent.click(screen.getByRole('button', { name: '+ Nuovo conto' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Nome del conto' }), 'Nuovo')
  await userEvent.click(screen.getByRole('button', { name: 'Crea conto' }))
  expect((await screen.findAllByRole('option', { name: 'Nuovo (EUR)' })).length).toBeGreaterThan(0)
  expect(screen.getByLabelText('Importo')).toHaveValue(123)
})
