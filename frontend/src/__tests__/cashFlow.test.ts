import { describe, expect, it } from 'vitest'
import { summarizeCashFlow, monthlyNetCashFlow, expectedMonthCashFlow } from '../utils/cashFlow'
import { computeMonthSummary, computeMetrics, computeNetWorthSeries } from '../pages/dashboard/data'
import type { Category, TransactionRow, BalanceRow } from '../api/client'

const categories: Category[] = [
  { id: 1, name: 'Investment', is_income: false, is_transfer: true, color: '#777' },
  { id: 2, name: 'Transfer', is_income: false, is_transfer: true, color: '#777' },
  { id: 3, name: 'Trade', is_income: false, is_transfer: true, color: '#777' },
  { id: 4, name: 'Dividends', is_income: true, is_transfer: false, color: '#777' },
]
const tx = (amount: number, category: string | null, date = '2026-10-01', amount_base = amount): TransactionRow => ({
  id: 1, account_id: 1, account: 'Bank', date, amount, amount_base, category,
  description: 'Example', value_date: null, reference: null, balance: null, notes: null,
})

describe('cash-flow accounting', () => {
  it('projects only outstanding payroll and remaining spending without double counting', () => {
    const salary = (amount: number, date: string) => ({ ...tx(amount, 'Income', date), description: 'INGRESO POR NÓMINA' })
    const rows = [salary(3000, '2026-07-27'), salary(3100, '2026-08-27'), salary(3200, '2026-09-25'),
      tx(-100, 'Food', '2026-07-20'), tx(-200, 'Food', '2026-08-20'), tx(-900, 'Food', '2026-09-20'),
      tx(-600, 'Housing', '2026-09-01'), tx(-10000, 'Investment', '2026-09-22'),
      tx(50, 'Reimbursements'), tx(-500, 'Housing'), salary(9999, '2026-10-27')]
    const forecast = expectedMonthCashFlow(rows, categories, '2026-10-17')
    expect(forecast).toMatchObject({ actual: -450, expectedSalary: 3100, remainingSpending: 200, expected: 2450, salaryReceived: false })
    const paid = expectedMonthCashFlow([...rows, salary(3000, '2026-10-16')], categories, '2026-10-17')
    expect(paid).toMatchObject({ actual: 2550, expectedSalary: 0, expected: 2350, salaryReceived: true })
    expect(expectedMonthCashFlow([salary(3000, '2026-09-27')], categories, '2026-10-17')).toBeNull()
  })
  it('charts calendar gaps, converted cash flows and selected historical periods', () => {
    const rows = [tx(2000, 'Income', '2025-12-01'), tx(-100, 'Food', '2026-02-01', -90),
      tx(-500, 'Investment', '2026-02-02'), tx(-200, 'Trade', '2026-02-03'),
      tx(1000, 'Income', '2026-03-01'), tx(999, 'Income', '2026-10-19')]
    expect(monthlyNetCashFlow(rows, categories, '2026-10-17', '2026-02')).toEqual([
      { month: '2025-12', income: 2000, spending: 0, net: 2000 },
      { month: '2026-01', income: 0, spending: 0, net: 0 },
      { month: '2026-02', income: 0, spending: 90, net: -90 },
    ])
    expect(monthlyNetCashFlow(rows, categories, '2026-10-17', '2026-10').at(-1)?.net).toBe(0)
    expect(monthlyNetCashFlow([], categories, '2026-10-17', '2026-10')).toEqual([])
  })
  it('agrees with dashboard for funding, trades, rent, tax, refunds and future records', () => {
    const rows = [tx(2000, 'Income'), tx(-5000, 'Investment'), tx(5000, 'Transfer'),
      tx(-4000, 'Trade'), tx(1000, 'Trade'), tx(20, 'Dividends'), tx(-3, 'Dividends'),
      tx(-800, 'Housing'), tx(-10, null), tx(30, 'Shopping'), tx(-999, 'Housing', '2026-10-19')]
    const total = summarizeCashFlow(rows, categories, '2026-10-17')
    const dashboard = computeMonthSummary(rows, categories, '2026-10', '2026-10-17')
    expect([total.income, total.spending, total.transfersOut, total.investmentFunding, total.futureCount]).toEqual([2050, 813, 5000, 5000, 1])
    expect([dashboard.income, dashboard.spending, dashboard.net]).toEqual([2050, 813, 1237])
    expect([...total.months.values()]).toEqual([{ income: 2050, spend: 813, transfersOut: 5000 }])
  })
  it('distinguishes an ordinary own-account transfer from investment-labelled funding', () => {
    const result = summarizeCashFlow([tx(-100, 'Transfer'), tx(100, 'Transfer'), tx(-500, 'Investment')], categories, '2026-10-17')
    expect([result.transfersOut, result.investmentFunding, result.spending, result.income]).toEqual([600, 500, 0, 0])
  })
  it('uses converted amounts and preserves a zero conversion', () => {
    const result = summarizeCashFlow([tx(-100, 'Food', undefined, -90), tx(-100, 'Food', undefined, 0)], categories, '2026-10-17')
    expect(result.spending).toBe(90)
  })
  it('does not include future balance snapshots in current net worth or charts', () => {
    const balance = (date: string, amount: number): BalanceRow => ({ id: 1, account_id: 1, account: 'Bank', date, amount_base: amount, amount_native: amount, account_type: 'liquid', currency: 'EUR' })
    const rows = [balance('2026-10-01', 1000), balance('2026-10-19', 2000)]
    expect(computeMetrics(rows, '2026-10-17').totalNow).toBe(1000)
    expect(computeNetWorthSeries(rows, '2026-10-17')).toEqual({x: ['2026-10-01'], y: [1000]})
  })
})
