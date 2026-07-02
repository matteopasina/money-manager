import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type BalanceRow, type TransactionRow, type Category, type BudgetsStatus } from '../api/client'
import MoneyChart, { ACCOUNT_PALETTE, fmt, fmtAmount } from '../components/MoneyChart'
import CashFlowSankey, { type SankeyNode } from '../components/CashFlowSankey'
import { budgetBarColor, budgetBarWidth } from './Budgets'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

interface TypeGroup {
  type: string
  now: number
  prev: number
  accounts: string[]
  color: string
}

interface Metrics {
  totalNow: number
  totalPrev: number
  liquid: number
  currency: string
  latestDate: string
  byType: TypeGroup[]
}

function computeMetrics(rows: BalanceRow[]): Metrics {
  if (!rows.length) return { totalNow: 0, totalPrev: 0, liquid: 0, currency: 'EUR', latestDate: '', byType: [] }

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

  return { totalNow, totalPrev, liquid, currency: 'EUR', latestDate, byType }
}

/** Forward-filled daily net-worth series across all accounts. */
function computeNetWorthSeries(rows: BalanceRow[]): { x: string[]; y: number[] } {
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

function buildAccountTraces(rows: BalanceRow[]) {
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
function buildSparkline(y: number[]): { line: string; area: string } | null {
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

interface SankeyData {
  month: string          // YYYY-MM
  isCurrentMonth: boolean
  sources: SankeyNode[]
  targets: SankeyNode[]
  income: number
  savings: number
  leftOver: number
  caption: string
}

function buildSankeyData(transactions: TransactionRow[], categories: Category[]): SankeyData | null {
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
  const monthName = new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long' })
  const inMonth = isCurrentMonth ? 'this month' : `in ${monthName}`
  const e = (n: number) => '€' + Math.round(n).toLocaleString('en-US')

  const caption = leftOver < -1
    ? `Spending exceeded income by ${e(-leftOver)} ${inMonth}.`
    : savings > 0
      ? `You saved ${e(savings)} of ${e(income)} income ${inMonth} — a ${Math.round((savings / income) * 100)}% savings rate — with ${e(Math.max(leftOver, 0))} still unspent.`
      : `You spent ${e(spend)} of ${e(income)} income ${inMonth}, leaving ${e(Math.max(leftOver, 0))} unspent.`

  return { month, isCurrentMonth, sources, targets, income, savings, leftOver, caption }
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Dashboard() {
  const [balances, setBalances]         = useState<BalanceRow[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [categories, setCategories]     = useState<Category[]>([])
  const [budgets, setBudgets]           = useState<BudgetsStatus | null>(null)
  const [loading, setLoading]           = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.balances.list(),
      api.transactions.list(),
      api.categories.list(),
      api.budgets.list().catch(() => null),
    ]).then(([b, t, c, bud]) => {
      setBalances(b)
      setTransactions(t)
      setCategories(c)
      setBudgets(bud)
    }).finally(() => setLoading(false))
  }, [])

  const metrics       = useMemo(() => computeMetrics(balances), [balances])
  const nwSeries      = useMemo(() => computeNetWorthSeries(balances), [balances])
  const accountTraces = useMemo(() => buildAccountTraces(balances), [balances])
  const spark    = useMemo(() => buildSparkline(nwSeries.y), [nwSeries])
  const sankey   = useMemo(() => buildSankeyData(transactions, categories), [transactions, categories])

  const delta    = metrics.totalNow - metrics.totalPrev
  const pct      = metrics.totalPrev ? (delta / metrics.totalPrev) * 100 : 0
  const invested = metrics.totalNow - metrics.liquid
  const liquidPct = metrics.totalNow ? Math.round((metrics.liquid / metrics.totalNow) * 100) : 0

  // Net-worth growth since 1 Jan
  const ytdPct = useMemo(() => {
    const jan1 = `${new Date().getFullYear()}-01-01`
    const idx = nwSeries.x.findIndex(d => d >= jan1)
    if (idx < 0 || idx >= nwSeries.y.length - 1 || nwSeries.y[idx] <= 0) return null
    return ((nwSeries.y[nwSeries.y.length - 1] - nwSeries.y[idx]) / nwSeries.y[idx]) * 100
  }, [nwSeries])

  const isDark = document.documentElement.dataset.theme === 'dark'
  const inkColor = isDark ? '#F4EEE2' : '#241F18'

  const nwTrace = {
    x: nwSeries.x,
    y: nwSeries.y,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Net Worth',
    line: { color: '#B8842B', width: 2.5, shape: 'spline' as const },
    marker: { color: '#F6F1E7', size: 6, line: { color: '#B8842B', width: 1.8 } },
    fill: 'tozeroy' as const,
    fillcolor: 'rgba(184,132,43,0.16)',
  }

  const allocTrace = [{
    labels: metrics.byType.map(g => g.type),
    values: metrics.byType.map(g => g.now),
    type: 'pie' as const,
    hole: 0.66,
    sort: false,
    direction: 'clockwise' as const,
    marker: { colors: metrics.byType.map(g => g.color), line: { color: isDark ? '#242019' : '#F6F1E7', width: 2 } },
    textinfo: 'none' as const,
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]

  if (loading) return <LoadingSpinner />

  if (!balances.length) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <Alert type="info">No balance data yet. Go to <strong>Accounts &amp; FX</strong> to add accounts, then record balance snapshots or import data.</Alert>
    </div>
  )

  const recentTx = transactions.slice(0, 6)

  // Top per-category budgets by usage for the widget (pct null = over → first).
  // The "All spending" total cap is shown as the widget's headline, not a row.
  const totalBudget = budgets?.total_budget ?? null
  const widgetRows = (budgets?.budgets ?? [])
    .filter(b => b.active && !b.orphaned && b.category_name !== '__total__')
    .sort((a, b) => (b.pct ?? 999) - (a.pct ?? 999))
    .slice(0, 5)

  return (
    <div>
      {/* Topbar */}
      <div className="page-header">
        <div>
          <h1>{greeting()}</h1>
          <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/balances')}>+ Add balance</button>
      </div>

      {/* Hero — net worth */}
      <div
        className="hero-card"
        style={{
          marginBottom: '18px',
          position: 'relative',
          overflow: 'hidden',
          background: 'radial-gradient(130% 220% at 88% -50%, #3E3525 0%, #241F18 55%)',
        }}
      >
        {spark && (
          <svg viewBox="0 0 300 76" preserveAspectRatio="none" style={{ position: 'absolute', left: 0, bottom: 0, width: '100%', height: 110, opacity: 0.45, pointerEvents: 'none' }}>
            <defs>
              <linearGradient id="herosparkfill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#B8842B" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#B8842B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={spark.area} fill="url(#herosparkfill)" />
            <path d={spark.line} fill="none" stroke="#B8842B" strokeWidth="1.4" opacity="0.9" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="hero-eyebrow">Total net worth</div>
          <div className="hero-figure">{fmt(metrics.totalNow, metrics.currency)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <span className="hero-delta-chip" style={delta < 0 ? { background: 'rgba(217,116,90,0.18)', color: '#E4937C' } : undefined}>
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{fmt(delta, metrics.currency)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-ink-muted)' }}>vs. previous snapshot</span>
          </div>
        </div>
        <div className="hero-side" style={{ position: 'relative' }}>
          <div>
            <div className="hero-side-label">Liquid</div>
            <div className="hero-side-value">{fmt(metrics.liquid, metrics.currency)}</div>
          </div>
          <div>
            <div className="hero-side-label">Invested</div>
            <div className="hero-side-value">{fmt(invested, metrics.currency)}</div>
          </div>
          <div>
            <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', gap: 3, marginBottom: 6 }}>
              <div style={{ width: `${liquidPct}%`, background: '#A6CE8B' }} />
              <div style={{ width: `${100 - liquidPct}%`, background: '#B8842B' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--on-ink-faint)' }}>
              <span>{liquidPct}% liquid</span><span>{100 - liquidPct}% invested</span>
            </div>
          </div>
          {metrics.latestDate && (
            <div style={{ fontSize: '11.5px', color: 'var(--on-ink-faint)' }}>
              Updated {new Date(metrics.latestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Account-type tiles */}
      <div style={{ display: 'grid', gap: '13px', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', marginBottom: '30px' }}>
        {metrics.byType.map(g => {
          const tileDelta = g.prev > 0 ? ((g.now - g.prev) / g.prev) * 100 : null
          return (
            <div
              key={g.type}
              className="account-tile card"
              style={{ cursor: 'pointer' }}
              onClick={() => navigate('/accounts')}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                  {g.type}
                </span>
                {tileDelta !== null && Math.abs(tileDelta) >= 0.05 && (
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: tileDelta >= 0 ? 'var(--gain)' : 'var(--loss)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    {tileDelta >= 0 ? '▲' : '▼'} {Math.abs(tileDelta).toFixed(1)}%
                  </span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 25, marginTop: 11, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                {fmt(g.now, metrics.currency)}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {g.accounts.length === 1 ? g.accounts[0] : `${g.accounts.length} accounts`} · {((g.now / metrics.totalNow) * 100).toFixed(1)}%
              </div>
            </div>
          )
        })}
      </div>

      {/* Two-up row: net worth chart + allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Net worth over time</div>
            {ytdPct !== null && (
              <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
                {ytdPct >= 0 ? '+' : ''}{ytdPct.toFixed(1)}% this year
              </div>
            )}
          </div>
          <MoneyChart
            data={[nwTrace]}
            layout={{ yaxis: { tickformat: ',.0f' } }}
            style={{ height: 280 }}
          />
        </div>

        <div className="card">
          <div className="section-title" style={{ marginBottom: 10 }}>Allocation</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
              <MoneyChart
                data={allocTrace}
                layout={{ showlegend: false, margin: { t: 0, b: 0, l: 0, r: 0 } }}
                style={{ height: 150 }}
              />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: 21, fontWeight: 700, color: inkColor, fontVariantNumeric: 'tabular-nums' }}>
                  €{Math.round(metrics.totalNow / 1000)}k
                </div>
                <div style={{ fontSize: 9, letterSpacing: '1.4px', color: 'var(--ink-faint)' }}>NET WORTH</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
              {metrics.byType.map(g => (
                <div key={g.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--ink-soft)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.type}</span>
                  <span style={{ color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>€{Math.round(g.now / 1000)}k</span>
                  <span style={{ color: 'var(--ink-ghost)', fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>
                    {((g.now / metrics.totalNow) * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cash-flow Sankey + Budgets widget */}
      {(sankey || widgetRows.length > 0 || totalBudget) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: sankey && (widgetRows.length > 0 || totalBudget) ? '1.6fr 1fr' : '1fr',
          gap: '18px', marginBottom: '18px', alignItems: 'start',
        }}>
          {sankey && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>
                  {sankey.isCurrentMonth
                    ? 'Cash flow this month'
                    : `Cash flow — ${new Date(sankey.month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`}
                </div>
                <div style={{ display: 'flex', gap: 16, fontSize: '11.5px', color: 'var(--ink-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#3F7A55' }} />Income</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#6E5A3E' }} />Spending</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#4A5C8A' }} />Left over</span>
                </div>
              </div>
              <CashFlowSankey
                sources={sankey.sources}
                targets={sankey.targets}
                hubAmount={'€' + Math.round(sankey.income).toLocaleString('en-US')}
              />
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 8 }}>{sankey.caption}</div>
            </div>
          )}
          {(widgetRows.length > 0 || totalBudget) && budgets && (
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Budgets</div>
                <button className="btn-link" onClick={() => navigate('/budgets')}>Manage →</button>
              </div>
              {totalBudget && (
                <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                    <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>All spending</span>
                    <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fmt(totalBudget.spent, budgets.currency)} / {fmt(totalBudget.effective, budgets.currency)}
                    </span>
                  </div>
                  <div className="progress-track" style={{ height: 7 }}>
                    <div className="progress-fill" style={{ width: budgetBarWidth(totalBudget.pct), background: budgetBarColor(totalBudget.pct) }} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {widgetRows.map(b => (
                  <div key={b.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {b.category_name}
                      </span>
                      <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmt(b.spent, budgets.currency)} / {fmt(b.effective, budgets.currency)}
                      </span>
                    </div>
                    <div className="progress-track" style={{ height: 6 }}>
                      <div className="progress-fill" style={{ width: budgetBarWidth(b.pct), background: budgetBarColor(b.pct) }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 12 }}>
                {fmt(budgets.totals.remaining, budgets.currency)} left across {budgets.budgets.filter(b => b.active).length} budget{budgets.budgets.filter(b => b.active).length === 1 ? '' : 's'} this month
              </div>
            </div>
          )}
        </div>
      )}

      {/* Accounts over time */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="section-title">Accounts over time</div>
        <MoneyChart
          data={accountTraces}
          layout={{ yaxis: { tickformat: ',.0f' }, showlegend: true }}
          style={{ height: 280 }}
        />
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ padding: '8px 6px 6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px 12px' }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Recent transactions</div>
          <button className="btn-link" onClick={() => navigate('/transactions')}>View all →</button>
        </div>
        {recentTx.length === 0 ? (
          <div style={{ padding: '1.5rem', color: 'var(--ink-faint)', textAlign: 'center', fontSize: '0.85rem' }}>
            No transactions yet
          </div>
        ) : (
          recentTx.map(t => (
            <div
              key={t.id}
              style={{ display: 'grid', gridTemplateColumns: '64px 1fr 130px 120px', alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: '1px solid var(--border-soft)' }}
            >
              <span style={{ fontSize: '12.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {new Date(t.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              <span style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.description}>
                {t.description}
              </span>
              <span style={{ justifySelf: 'start' }}>
                {t.category ? <span className="badge" style={{ background: 'var(--bg-chip)', color: 'var(--ink-muted)' }}>{t.category}</span> : '—'}
              </span>
              <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.amount >= 0 ? 'var(--gain)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
                {t.amount >= 0 ? '+' : ''}{fmtAmount(t.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
