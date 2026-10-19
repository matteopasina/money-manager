import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import GoalCalculator from '../pages/GoalCalculator'
import { api } from '../api/client'

vi.mock('../api/client', () => ({ api: { analytics: { fire: vi.fn(), accountReturns: vi.fn() } } }))
vi.mock('../components/MoneyChart', () => ({ default: () => <div>Chart</div> }))
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('uses a separate scenario rate and reuses return information from the projection response', async () => {
  vi.mocked(api.analytics.fire).mockResolvedValue({
    current_nw: 50000, monthly_contribution: 500, monthly_expenses: 1000,
    fire_number: 300000, target_amount: 1000000, months_to_target: 360, years_to_target: 30,
    projection: [{date: '2026-11-01',amount: 50700}], currency: 'EUR',
    detected_income: 1500, detected_expenses: 1000, detected_return_pct: 24,
  })
  render(<MemoryRouter><GoalCalculator /></MemoryRouter>)
  expect(await screen.findByText(/Rendimento annualizzato registrato: 24.0%/)).toBeInTheDocument()
  expect(api.analytics.accountReturns).not.toHaveBeenCalled()
  expect(api.analytics.fire).toHaveBeenCalledWith(expect.objectContaining({annual_return_pct: 7}))
  expect(screen.getAllByDisplayValue('7')).toHaveLength(2)
})
