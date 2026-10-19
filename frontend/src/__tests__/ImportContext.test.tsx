import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Import from '../pages/Import'
import { api } from '../api/client'
vi.mock('../api/client', () => ({ api: { accounts: { list: vi.fn() }, import: { adapters: vi.fn(), preview: vi.fn(), confirm: vi.fn() } } }))
afterEach(() => { cleanup(); vi.resetAllMocks() })
it('prefills the contextual account and type, and allows switching between balance and transaction formats', async () => {
  vi.mocked(api.accounts.list).mockResolvedValue([{ id: 2, name: 'Riserva', currency: 'EUR', account_type: 'liquid', active: true }])
  vi.mocked(api.import.adapters).mockResolvedValue([{ name: 'CSV saldi', imports: 'balances', file_types: ['csv'] }, { name: 'Estratto conto', imports: 'transactions', file_types: ['xlsx'] }])
  render(<MemoryRouter initialEntries={['/import?type=balances&account_id=2']}><Import /></MemoryRouter>)
  expect(await screen.findByRole('combobox', { name: 'Conto' })).toHaveValue('2')
  expect(screen.getByRole('combobox', { name: 'Cosa vuoi importare?' })).toHaveValue('balances')
  expect(screen.getByRole('option', { name: 'CSV saldi (csv)' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'Estratto conto (xlsx)' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: '← Torna a conti e saldi' })).toHaveAttribute('href', '/wealth/accounts')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Cosa vuoi importare?' }), 'transactions')
  expect(screen.getByRole('option', { name: 'Estratto conto (xlsx)' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: 'CSV saldi (csv)' })).not.toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: 'Conto' })).toHaveValue('2')
  expect(api.import.confirm).not.toHaveBeenCalled()
})
