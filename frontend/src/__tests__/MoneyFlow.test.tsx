import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { moneyFlowLayout, flowCategories } from '../pages/home/moneyFlowLayout'
import FlowCard from '../pages/home/FlowCard'
import type { MonthSummary } from '../pages/dashboard/data'

const summary: MonthSummary = { month: '2026-10', income: 804, spending: 2135, net: -1331, count: 5, savingsRate: -165.5, previousSpending: null, comparisonLabel: '', uncategorizedCount: 1, uncategorizedSpend: 69, latestTransaction: '2026-10-19', categories: [
  { name: 'Bills', amount: 1026, color: '#b57c50' }, { name: 'Housing', amount: 800, color: '#83916b' },
  { name: 'Food', amount: 140, color: '#47835a' }, { name: 'Transport', amount: 100, color: '#887750' },
  { name: 'Uncategorized', amount: 69, color: '#777777' },
] }
afterEach(cleanup)
it('conserves mixed income and liquidity through every expense branch', () => {
  const layout = moneyFlowLayout(summary)
  expect(layout.funded + layout.deficit).toBeCloseTo(summary.spending * layout.scale)
  expect(layout.branches.reduce((sum, branch) => sum + branch.height, 0)).toBeCloseTo(summary.spending * layout.scale)
  expect(layout.surplus).toBe(0)
  expect(layout.branches.every(b => b.height > 0)).toBe(true)
})
it('keeps all small categories in the visible remainder', () => {
  const categories = flowCategories(summary)
  expect(categories).toHaveLength(4)
  expect(categories.at(-1)).toMatchObject({ name: 'Altre spese', amount: 169, grouped: true })
  expect(categories.reduce((sum, c) => sum + c.amount, 0)).toBe(2135)
})
it('handles income-only and empty months without invalid geometry', () => {
  const incomeOnly = moneyFlowLayout({ ...summary, spending: 0, income: 1000, net: 1000, categories: [] })
  expect(incomeOnly.surplus).toBe(96)
  expect(incomeOnly.deficit).toBe(0)
  const empty = moneyFlowLayout({ ...summary, spending: 0, income: 0, net: 0, categories: [] })
  expect(empty.scale).toBe(0)
  expect(empty.branches).toEqual([])
})
function Location() { const location = useLocation(); return <output data-testid="url">{location.pathname}{location.search}</output> }
it('opens a category with the exact month and cutoff used by the graphic', async () => {
  render(<MemoryRouter><FlowCard summary={summary} currency="EUR" asOf="2026-10-19" /><Location /></MemoryRouter>)
  await userEvent.click(screen.getByRole('link', { name: 'Bills: €1,026, 48%. Vedi movimenti' }))
  expect(screen.getByTestId('url')).toHaveTextContent('/transactions?start=2026-10-01&end=2026-10-19&category=Bills')
})
