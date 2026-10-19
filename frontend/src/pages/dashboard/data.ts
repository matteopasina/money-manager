import { ACCOUNT_PALETTE } from '../../utils/chartPalette'
import { baseAmount, cashFlowKind } from '../../utils/cashFlow'
import { parseLocalDate, todayLocal } from '../../utils/date'
import type { BalanceRow, TransactionRow, Category, AssistantInsight } from '../../api/client'

export interface TypeGroup {
  type: string
  now: number
  prev: number
  accounts: string[]
  color: string
}

export interface Metrics {
  totalNow: number
  totalPrev: number
  liquid: number
  latestDate: string
  oldestDate: string
  comparedAccounts: number
  accountCount: number
  byType: TypeGroup[]
  comparisons: { label: string; date: string; delta: number | null; pct: number | null; accounts: number }[]
}

export function computeMetrics(rows: BalanceRow[], asOf = todayLocal()): Metrics {
  rows = rows.filter(row => row.date <= asOf)
  if (!rows.length) return { totalNow: 0, totalPrev: 0, liquid: 0, latestDate: '', oldestDate: '', comparedAccounts: 0, accountCount: 0, byType: [], comparisons: [] }

  // Latest balance per account (accounts update at different frequencies)
  const latestPerAccount = Object.values(
    rows.reduce<Record<number, BalanceRow>>((acc, r) => {
      if (!acc[r.account_id] || r.date > acc[r.account_id].date) acc[r.account_id] = r
      return acc
    }, {})
  )

  const latestDate = latestPerAccount.reduce((d, r) => (r.date > d ? r.date : d), '')
  const totalNow   = latestPerAccount.reduce((s, r) => s + r.amount_base, 0)
  const liquid     = latestPerAccount.filter(r => r.account_type === 'liquid').reduce((s, r) => s + r.amount_base, 0)
  const today = parseLocalDate(asOf)
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  const month = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  month.setDate(Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()))
  const comparisons = [{ label: 'previous day', date: day }, { label: 'previous month', date: month }].map(period => {
    const cutoff = `${period.date.getFullYear()}-${String(period.date.getMonth() + 1).padStart(2, '0')}-${String(period.date.getDate()).padStart(2, '0')}`
    const baseline = new Map<number, BalanceRow>()
    for (const row of rows) {
      if (row.date <= cutoff && (!baseline.has(row.account_id) || row.date > baseline.get(row.account_id)!.date)) baseline.set(row.account_id, row)
    }
    // Compare the same accounts on both sides; newly tracked accounts are not gains.
    const comparable = latestPerAccount.filter(row => baseline.has(row.account_id))
    const before = comparable.reduce((sum, row) => sum + baseline.get(row.account_id)!.amount_base, 0)
    const delta = comparable.length ? comparable.reduce((sum, row) => sum + row.amount_base, 0) - before : null
    return { label: period.label, date: cutoff, delta, pct: delta !== null && before > 0 ? delta / before * 100 : null, accounts: comparable.length }
  })

  // Previous: per account, the entry just before their current latest
  const latestById = new Map(latestPerAccount.map(row => [row.account_id, row]))
  const prevByAccount: Record<number, BalanceRow> = rows.reduce<Record<number, BalanceRow>>((acc, r) => {
    const cur = latestById.get(r.account_id)
    if (cur && r.date < cur.date) {
      if (!acc[r.account_id] || r.date > acc[r.account_id].date) acc[r.account_id] = r
    }
    return acc
  }, {})
  const totalPrev = latestPerAccount.reduce((s, r) => s + (prevByAccount[r.account_id]?.amount_base ?? r.amount_base), 0)

  // Group by account type. For the per-type delta, accounts without a previous
  // snapshot count at their current value on both sides so they don't fake a gain.
  const typeMap: Record<string, TypeGroup> = {}
  for (const r of latestPerAccount) {
    const t = r.account_type || 'other'
    if (!typeMap[t]) typeMap[t] = { type: t, now: 0, prev: 0, accounts: [], color: '' }
    typeMap[t].now  += r.amount_base
    typeMap[t].prev += prevByAccount[r.account_id]?.amount_base ?? r.amount_base
    typeMap[t].accounts.push(r.account)
  }
  const byType = Object.values(typeMap).sort((a, b) => b.now - a.now)
  byType.forEach((g, i) => { g.color = ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length] })

  return { totalNow, totalPrev, liquid, latestDate, byType, comparisons,
    oldestDate: latestPerAccount.reduce((d, r) => r.date < d ? r.date : d, latestDate),
    comparedAccounts: Object.keys(prevByAccount).length, accountCount: latestPerAccount.length,
  }
}

/** Aggregate only recorded snapshot dates; never add daily/resampled points. */
export function computeNetWorthSeries(rows: BalanceRow[], asOf = todayLocal()): { x: string[]; y: number[] } {
  const latest = new Map<number, number>()
  const totals = new Map<string, number>()
  let total = 0
  for (const row of rows.filter(row => row.date <= asOf).sort((a, b) => a.date.localeCompare(b.date))) {
    total += row.amount_base - (latest.get(row.account_id) ?? 0)
    latest.set(row.account_id, row.amount_base)
    totals.set(row.date, total)
  }
  return { x: [...totals.keys()], y: [...totals.values()] }
}

/** A true year-opening comparison needs a snapshot on or before January 1. */
export function computeYtdPct(series: { x: string[]; y: number[] }, today = todayLocal()): number | null {
  const jan1 = `${today.slice(0, 4)}-01-01`
  const eligible = series.x.map((date, i) => ({ date, value: series.y[i] })).filter(p => p.date <= today)
  const baseline = eligible.filter(p => p.date <= jan1).at(-1)
  const latest = eligible.at(-1)
  if (!baseline || !latest || latest.date <= jan1 || baseline.value <= 0) return null
  return (latest.value - baseline.value) / baseline.value * 100
}

export function buildAccountTraces(rows: BalanceRow[]) {
  const byAccount = [...rows].sort((a, b) => a.date.localeCompare(b.date)).reduce<Record<string, { dates: string[]; values: number[] }>>((acc, r) => {
    if (!acc[r.account]) acc[r.account] = { dates: [], values: [] }
    acc[r.account].dates.push(r.date)
    acc[r.account].values.push(r.amount_base)
    return acc
  }, {})

  return Object.entries(byAccount).map(([name, { dates, values }], i) => ({
    x: dates,
    y: values,
    type: 'scatter' as const,
    mode: 'lines' as const,
    name,
    line: { color: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length], width: 2 },
  }))
}

/** Ambient hero sparkline: smooth path through the net-worth series, viewBox 300×76. */
export function buildSparkline(y: number[]): { line: string; area: string } | null {
  if (y.length < 3) return null
  const step = Math.max(1, Math.ceil(y.length / 40))
  const pts0 = y.filter((_, i) => i % step === 0)
  if (pts0[pts0.length - 1] !== y[y.length - 1]) pts0.push(y[y.length - 1])
  const min = Math.min(...pts0), max = Math.max(...pts0)
  const span = max - min || 1
  const pts = pts0.map((v, i) => ({
    x: (i / (pts0.length - 1)) * 300,
    y: 70 - ((v - min) / span) * 60,
  }))
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const xc = (pts[i].x + pts[i + 1].x) / 2
    const yc = (pts[i].y + pts[i + 1].y) / 2
    d += ` Q${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${xc.toFixed(1)},${yc.toFixed(1)}`
  }
  const last = pts[pts.length - 1]
  d += ` L${last.x.toFixed(1)},${last.y.toFixed(1)}`
  return { line: d, area: `${d} L300,76 L0,76 Z` }
}

export interface MonthSummary {
  month: string
  income: number
  spending: number
  net: number
  savingsRate: number | null
  count: number
  previousSpending: number | null
  comparisonLabel: string
  categories: { name: string; amount: number; color: string }[]
  uncategorizedCount: number
  uncategorizedSpend: number
  latestTransaction: string | null
}

/** Match backend spending_frame: negative base amounts, excluding transfers. */
export function computeMonthSummary(
  transactions: TransactionRow[], categories: Category[], month: string, today = todayLocal(),
): MonthSummary {
  const transferCats = new Set(categories.filter(c => c.is_transfer).map(c => c.name))
  const current = month === today.slice(0, 7)
  const date = parseLocalDate(month)
  const previous = new Date(date.getFullYear(), date.getMonth() - 1, 1)
  const previousMonth = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const previousDays = new Date(date.getFullYear(), date.getMonth(), 0).getDate()
  const cutoffDay = current ? Math.min(Number(today.slice(8, 10)), previousDays) : previousDays
  const previousEnd = `${previousMonth}-${String(cutoffDay).padStart(2, '0')}`
  const relevant = transactions.filter(t => t.date <= today && !['transfer', 'trade'].includes(cashFlowKind(t, transferCats)))
  const rows = relevant.filter(t => t.date.slice(0, 7) === month)
  const prior = relevant.filter(t => t.date.slice(0, 7) === previousMonth && t.date <= previousEnd)
  const byCategory = new Map<string, number>()
  let income = 0, spending = 0, uncategorizedCount = 0, uncategorizedSpend = 0
  for (const t of rows) {
    const amount = baseAmount(t)
    if (amount > 0) income += amount
    if (amount < 0) {
      spending -= amount
      const name = t.category || 'Uncategorized'
      byCategory.set(name, (byCategory.get(name) ?? 0) - amount)
      if (!t.category) { uncategorizedCount++; uncategorizedSpend -= amount }
    }
  }
  return {
    month, income, spending, net: income - spending,
    savingsRate: income > 0 ? (income - spending) / income * 100 : null,
    count: rows.length,
    previousSpending: prior.length ? prior.reduce((sum, t) => sum + Math.max(0, -(baseAmount(t))), 0) : null,
    comparisonLabel: current ? `vs. days 1–${cutoffDay} last month` : 'vs. previous month',
    categories: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, amount], i) => ({
      name, amount, color: categories.find(c => c.name === name)?.color || ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length],
    })),
    uncategorizedCount, uncategorizedSpend,
    latestTransaction: transactions.filter(t => t.date <= today).map(t => t.date).sort().at(-1) ?? null,
  }
}

export function insightTone(severity: AssistantInsight['severity']) {
  if (severity === 'good') return { dot: 'var(--gain)', bg: 'rgba(63,122,85,0.12)' }
  if (severity === 'warning') return { dot: 'var(--loss)', bg: 'rgba(190,74,51,0.10)' }
  return { dot: 'var(--accent)', bg: 'rgba(184,132,43,0.11)' }
}
