import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Connections from '../pages/Connections'
import { api } from '../api/client'

vi.mock('../api/client', () => ({ SECRET_MASK: '__secret__', api: {
  settings: { all: vi.fn(), set: vi.fn() }, accounts: { list: vi.fn() },
  sync: { status: vi.fn(), runNow: vi.fn(), updateSettings: vi.fn() },
  bbva: { linkStatus: vi.fn(), exchangeCode: vi.fn(), connect: vi.fn() },
  revolut: { linkStatus: vi.fn(), exchangeCode: vi.fn() },
} }))

beforeEach(() => {
  window.history.replaceState(null, '', '/connections')
  vi.mocked(api.settings.all).mockResolvedValue({
    enablebanking_application_id: 'app', enablebanking_private_key: '__secret__',
    bbva_eb_session_id: 'session', bbva_eb_aspsp_name: 'BBVA', bbva_eb_aspsp_country: 'IT', bbva_account_id: '1',
  })
  vi.mocked(api.settings.set).mockResolvedValue(undefined)
  vi.mocked(api.accounts.list).mockResolvedValue([{ id: 1, name: 'Bank', currency: 'EUR', account_type: 'liquid', active: true }])
  vi.mocked(api.sync.status).mockResolvedValue({ enabled: true, interval_hours: 12, integrations: [] })
  vi.mocked(api.bbva.linkStatus).mockResolvedValue({ status: 'active', valid_until: '2026-12-28T21:05:43Z' })
})
afterEach(() => { cleanup(); vi.resetAllMocks(); window.history.replaceState(null, '', '/') })

describe('Connections', () => {
  it('shows bank consent expiry and can recheck it', async () => {
    render(<Connections />)
    expect(await screen.findByText(/Bank authorisation valid until/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Check connection' }))
    await waitFor(() => expect(api.bbva.linkStatus).toHaveBeenCalledTimes(2))
  })

  it('keeps temporary failures distinct from expired consent', async () => {
    vi.mocked(api.bbva.linkStatus).mockRejectedValue(new Error('Bank temporarily unavailable'))
    render(<Connections />)
    expect(await screen.findByText(/This does not mean it has expired/)).toBeInTheDocument()
    expect(screen.getByText('Check unavailable')).toBeInTheDocument()
    expect(screen.queryByText('Reconnect required')).not.toBeInTheDocument()
  })

  it('disables imports after consent expiry and saves settings before reconnecting', async () => {
    vi.mocked(api.bbva.linkStatus).mockResolvedValue({ status: 'expired' })
    vi.mocked(api.bbva.connect).mockRejectedValue(new Error('Authorisation service unavailable'))
    render(<Connections />)
    const title = await screen.findByText('Reconnect required')
    const card = within(title.closest('.card') as HTMLElement)
    expect(card.getByRole('button', { name: 'Sync Transactions' })).toBeDisabled()
    await userEvent.click(card.getByRole('button', { name: 'Reconnect' }))
    await waitFor(() => expect(api.bbva.connect).toHaveBeenCalledWith(`${window.location.origin}/connections`))
    expect(api.settings.set).toHaveBeenCalledWith('bbva_account_id', '1')
    expect(api.settings.set).not.toHaveBeenCalledWith('enablebanking_private_key', '__secret__')
  })

  it('exchanges the bank callback once under StrictMode, after settings load', async () => {
    window.history.replaceState(null, '', '/connections?code=single-use&state=bbva')
    vi.mocked(api.bbva.exchangeCode).mockResolvedValue({ session_id: 'new-session', accounts: [] })
    render(<StrictMode><Connections /></StrictMode>)
    expect(await screen.findByText('BBVA connected successfully!')).toBeInTheDocument()
    expect(api.bbva.exchangeCode).toHaveBeenCalledExactlyOnceWith('single-use')
    await waitFor(() => expect(window.location.search).toBe(''))
  })
})
