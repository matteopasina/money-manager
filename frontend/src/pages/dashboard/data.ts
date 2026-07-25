import { ACCOUNT_PALETTE } from '../../components/MoneyChart'
import { formatMonthLabel } from '../../utils/date'
import type { BalanceRow, TransactionRow, Category, AssistantInsight } from '../../api/client'
import type { SankeyNode } from '../../components/CashFlowSankey'

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
  byType: TypeGroup[]
}

export function computeMetrics(rows: BalanceRow[]): Metrics {
  if (!rows.length) return { totalNow: 0, totalPrev: 0, liquid: 0, latestDate: '', byType: [] }

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

  // Previous: per account, the entry just before their current latest
  const prevByAccount: Record<number, BalanceRow> = rows.reduce<Record<number, BalanceRow>>((acc, r) => {
    const cur = latestPerAccount.find(x => x.account_id === r.account_id)
    if (cur && r.date < cur.date) {
      if (!acc[r.account_id] || r.date > acc[r.account_id].date) acc[r.account_id] = r
    }
    return acc
  }, {})
  const totalPrev = Object.values(prevByAccount).reduce((s, r) => s + r.amount_base, 0)

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

  return { totalNow, totalPrev, liquid, latestDate, byType }
}

/** Forward-filled daily net-worth series across all accounts. */
export function computeNetWorthSeries(rows: BalanceRow[]): { x: string[]; y: number[] } {
  const accountIds = [...new Set(rows.map(r => r.account_id))]
  const allDates   = [...new Set(rows.map(r => r.date))].sort()

  const history: Record<number, { date: string; val: number }[]> = {}
  for (const id of accountIds) {
    history[id] = rows
      .filter(r => r.account_id === id)
      .map(r => ({ date: r.date, val: r.amount_base }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  const totals = allDates.map(d =>
    accountIds.reduce((sum, id) => {
      let last = 0
      for (const p of history[id]) {
        if (p.date <= d) last = p.val; else break
      }
      return sum + last
    }, 0)
  )
  return { x: allDates, y: totals }
}

export function buildAccountTraces(rows: BalanceRow[]) {
  const byAccount = rows.reduce<Record<string, { dates: string[]; values: number[] }>>((acc, r) => {
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

// ── Cash-flow Sankey data ──────────────────────────────────────────────────────

const SRC_COLORS = ['#3F7A55', '#B8842B', '#A88B5C', '#C97B4A', '#8C7A5C']
const TGT_COLORS = ['#6E5A3E', '#B8842B', '#A88B5C', '#8C7A5C', '#C97B4A']
const SAVINGS_COLOR  = '#3F7A55'
const LEFTOVER_COLOR = '#4A5C8A'
const DEFICIT_COLOR  = '#BE4A33'

export interface SankeyData {
  month: string          // YYYY-MM
  isCurrentMonth: boolean
  sources: SankeyNode[]
  targets: SankeyNode[]
  income: number
  savings: number
  leftOver: number
  caption: string
}

export function buildSankeyData(transactions: TransactionRow[], categories: Category[]): SankeyData | null {
  const transferCats = new Set(categories.filter(c => c.is_transfer).map(c => c.name))

  // Show the most recent month that actually has income — early in a month the
  // current one is empty, so fall back to the last complete picture.
  const incomeMonths = transactions
    .filter(t => t.amount > 0 && !transferCats.has(t.category ?? ''))
    .map(t => t.date.slice(0, 7))
  if (!incomeMonths.length) return null
  const month = incomeMonths.sort().at(-1)!
  const rows = transactions.filter(t => t.date.slice(0, 7) === month)

  const sourceSums: Record<string, number> = {}
  const spendSums: Record<string, number> = {}
  let income = 0, spend = 0, savings = 0

  for (const t of rows) {
    const cat = t.category ?? ''
    if (cat === 'Trade') {
      // Brokerage trades are cash→asset conversions inside an account — the money
      // was already counted as savings when it was transferred in. Skip entirely.
      continue
    }
    if (transferCats.has(cat)) {
      // Transfers between own accounts: only the outgoing leg is money "used"
      if (t.amount < 0) savings += -t.amount
    } else if (t.amount > 0) {
      const label = cat === 'Income' ? 'Salary' : (!cat || cat === 'Other') ? 'Other income' : cat
      sourceSums[label] = (sourceSums[label] ?? 0) + t.amount
      income += t.amount
    } else {
      const label = cat || 'Uncategorized'
      spendSums[label] = (spendSums[label] ?? 0) + -t.amount
      spend += -t.amount
    }
  }
  if (income <= 0) return null

  const sources: SankeyNode[] = Object.entries(sourceSums)
    .sort((a, b) => b[1] - a[1])
    .map(([name, val], i) => ({ name, val, color: SRC_COLORS[i % SRC_COLORS.length] }))

  const ranked = Object.entries(spendSums).sort((a, b) => b[1] - a[1])
  const top = ranked.slice(0, 5)
  const restVal = ranked.slice(5).reduce((s, [, v]) => s + v, 0)
  const targets: SankeyNode[] = top.map(([name, val], i) => ({ name, val, color: TGT_COLORS[i % TGT_COLORS.length] }))
  if (restVal > 0) targets.push({ name: 'Other spending', val: restVal, color: '#928873' })
  if (savings > 0) targets.push({ name: 'Savings & Invest', val: savings, color: SAVINGS_COLOR })

  const leftOver = income - spend - savings
  if (leftOver >= 1) {
    targets.push({ name: 'Left over', val: leftOver, color: LEFTOVER_COLOR })
  } else if (leftOver < -1) {
    // Spent more than earned: balance the flow with a deficit source
    sources.push({ name: 'From savings', val: -leftOver, color: DEFICIT_COLOR })
  }

  const now = new Date()
  const isCurrentMonth = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthName = formatMonthLabel(month)
  const inMonth = isCurrentMonth ? 'this month' : `in ${monthName}`
  const e = (n: number) => '€' + Math.round(n).toLocaleString('en-US')

  const caption = leftOver < -1
    ? `Spending exceeded income by ${e(-leftOver)} ${inMonth}.`
    : savings > 0
      ? `You saved ${e(savings)} of ${e(income)} income ${inMonth} — a ${Math.round((savings / income) * 100)}% savings rate — with ${e(Math.max(leftOver, 0))} still unspent.`
      : `You spent ${e(spend)} of ${e(income)} income ${inMonth}, leaving ${e(Math.max(leftOver, 0))} unspent.`

  return { month, isCurrentMonth, sources, targets, income, savings, leftOver, caption }
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function insightTone(severity: AssistantInsight['severity']) {
  if (severity === 'good') return { dot: 'var(--gain)', bg: 'rgba(63,122,85,0.12)' }
  if (severity === 'warning') return { dot: 'var(--loss)', bg: 'rgba(190,74,51,0.10)' }
  return { dot: 'var(--accent)', bg: 'rgba(184,132,43,0.11)' }
}
