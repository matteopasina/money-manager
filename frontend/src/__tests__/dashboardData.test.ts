import { describe, expect, it } from 'vitest'
import { computeMetrics, computeMonthSummary, computeNetWorthSeries, computeYtdPct, buildAccountTraces } from '../pages/dashboard/data'
import type { BalanceRow, Category, TransactionRow } from '../api/client'
const balance = (account_id: number, date: string, amount_base: number): BalanceRow => ({ id: account_id, account_id, date, amount_base, amount_native: amount_base, account: `Account ${account_id}`, currency: 'EUR', account_type: 'liquid' })
const tx = (date: string, amount: number, category: string | null = 'Food', amount_base: number | null = amount): TransactionRow => ({ id: 1, account_id: 1, account: 'Bank', date, amount, amount_base, category, description: 'Example', value_date: null, reference: null, balance: null, notes: null })
const categories: Category[] = [{ id: 1, name: 'Transfer', color: '#777', is_transfer: true, is_income: false }]
describe('net worth', () => {
  it('compares calendar cutoffs using matching accounts and last known balances', () => {
    const m = computeMetrics([
      balance(1, '2026-09-18', 100), balance(1, '2026-09-20', 150),
      balance(1, '2026-10-18', 180), balance(1, '2026-10-19', 200),
      balance(2, '2026-07-01', 500), balance(3, '2026-10-19', 1000),
      balance(1, '2026-10-20', 9999),
    ], '2026-10-19')
    expect(m.comparisons).toEqual([
      { label: 'previous day', date: '2026-10-18', delta: 20, pct: 20 / 680 * 100, accounts: 2 },
      { label: 'previous month', date: '2026-09-19', delta: 100, pct: 100 / 600 * 100, accounts: 2 },
    ])
  })
  it('clamps the previous month at month-end and handles missing baselines', () => {
    const rows = [balance(1, '2024-02-29', 0), balance(1, '2024-03-31', 100)]
    const m = computeMetrics(rows, '2024-03-31')
    expect(m.comparisons[1]).toMatchObject({ date: '2024-02-29', delta: 100, pct: null })
    const first = computeMetrics([balance(1, '2026-01-01', 100)], '2026-01-01')
    expect(first.comparisons.map(c => [c.date, c.delta, c.accounts])).toEqual([['2025-12-31', null, 0], ['2025-12-01', null, 0]])
  })
  it('does not count a new account as a gain', () => {
    const m = computeMetrics([balance(1, '2026-08-01', 100), balance(1, '2026-09-01', 120), balance(2, '2026-09-01', 500)])
    expect(m.totalNow - m.totalPrev).toBe(20)
    expect(m.comparedAccounts).toBe(1)
    expect(m.byType[0].now - m.byType[0].prev).toBe(20)
  })
  it('handles first snapshots, zero net worth and negative balances', () => {
    const m = computeMetrics([balance(1, '2026-09-01', -500), balance(2, '2026-09-01', 500)])
    expect(m.totalNow).toBe(0)
    expect(m.totalPrev).toBe(0)
    expect(m.comparedAccounts).toBe(0)
  })
  it('surfaces the range of snapshot dates', () => {
    const m = computeMetrics([balance(1, '2026-06-01', 100), balance(2, '2026-09-01', 500)])
    expect(m.oldestDate).toBe('2026-06-01')
    expect(m.latestDate).toBe('2026-09-01')
  })
  it('sorts without mutation and aggregates only recorded dates', () => {
    const rows = [balance(1, '2026-09-01', 120), balance(1, '2026-08-01', 100), balance(2, '2026-08-10', 50)]
    expect(computeNetWorthSeries(rows)).toEqual({ x: ['2026-08-01', '2026-08-10', '2026-09-01'], y: [100, 150, 170] })
    expect(buildAccountTraces(rows)[0].x).toEqual(['2026-08-01', '2026-09-01'])
    expect(rows[0].date).toBe('2026-09-01')
  })
  it('requires and uses a year-opening snapshot for YTD', () => {
    expect(computeYtdPct({ x: ['2025-12-31', '2026-02-01', '2026-09-01'], y: [100, 150, 200] }, '2026-09-07')).toBe(100)
    expect(computeYtdPct({ x: ['2026-02-01', '2026-09-01'], y: [150, 200] }, '2026-09-07')).toBeNull()
  })
})
describe('monthly cash flow', () => {
  it('uses base currency and excludes both transfer legs', () => {
    const s = computeMonthSummary([tx('2026-09-01', 1000, 'Income', 800), tx('2026-09-02', -100, 'Food', -80), tx('2026-09-03', -400, 'Transfer'), tx('2026-09-03', 400, 'Transfer')], categories, '2026-09', '2026-09-07')
    expect([s.income, s.spending, s.net, s.savingsRate, s.count]).toEqual([800, 80, 720, 90, 2])
  })
  it('shows expense-only months without a fabricated savings rate', () => {
    const s = computeMonthSummary([tx('2026-09-01', -100)], [], '2026-09', '2026-09-07')
    expect([s.spending, s.net, s.savingsRate]).toEqual([100, -100, null])
  })
  it('compares elapsed days and ignores future transactions', () => {
    const s = computeMonthSummary([tx('2026-08-03', -100), tx('2026-08-15', -500), tx('2026-09-03', -120), tx('2026-09-08', -900)], [], '2026-09', '2026-09-07')
    expect([s.spending, s.previousSpending, s.latestTransaction]).toEqual([120, 100, '2026-09-03'])
  })
  it('compares full past months and clamps shorter previous months', () => {
    const rows = [tx('2026-02-28', -50), tx('2026-03-30', -100), tx('2026-03-31', -100)]
    expect(computeMonthSummary(rows, [], '2026-03', '2026-03-30').previousSpending).toBe(50)
    expect(computeMonthSummary(rows, [], '2026-03', '2026-04-05').spending).toBe(200)
  })
  it('handles null and zero conversion amounts and uncategorized expenses', () => {
    const s = computeMonthSummary([tx('2026-09-01', -10, null, null), tx('2026-09-01', -100, 'Food', 0)], [], '2026-09', '2026-09-07')
    expect([s.spending, s.uncategorizedCount, s.uncategorizedSpend, s.previousSpending]).toEqual([10, 1, 10, null])
  })
  it('distinguishes missing records from zero spending', () => {
    expect(computeMonthSummary([], [], '2026-09', '2026-09-07').count).toBe(0)
    const s = computeMonthSummary([tx('2026-08-01', 1000, 'Income')], [], '2026-09', '2026-09-07')
    expect(s.previousSpending).toBe(0)
    expect(s.count).toBe(0)
  })
})
