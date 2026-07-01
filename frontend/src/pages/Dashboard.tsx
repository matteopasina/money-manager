import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type BalanceRow, type TransactionRow } from '../api/client'
import MoneyChart, { ACCOUNT_PALETTE, fmt, fmtAmount } from '../components/MoneyChart'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

interface Metrics {
  totalNow: number
  totalPrev: number
  liquid: number
  currency: string
  latestDate: string
  byAccount: { account: string; latest: number; currency: string; accountType: string }[]
}

function computeMetrics(rows: BalanceRow[]): Metrics {
  if (!rows.length) return { totalNow: 0, totalPrev: 0, liquid: 0, currency: 'EUR', latestDate: '', byAccount: [] }

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
  const prevPerAccount = Object.values(
    rows.reduce<Record<number, BalanceRow>>((acc, r) => {
      const cur = latestPerAccount.find(x => x.account_id === r.account_id)
      if (cur && r.date < cur.date) {
        if (!acc[r.account_id] || r.date > acc[r.account_id].date) acc[r.account_id] = r
      }
      return acc
    }, {})
  )
  const totalPrev = prevPerAccount.reduce((s, r) => s + r.amount_base, 0)

  const byAccount = latestPerAccount
    .map(r => ({ account: r.account, latest: r.amount_base, currency: r.currency, accountType: r.account_type }))
    .sort((a, b) => b.latest - a.latest)

  return { totalNow, totalPrev, liquid, currency: 'EUR', latestDate, byAccount }
}

function buildNetWorthTrace(rows: BalanceRow[]) {
  const accountIds = [...new Set(rows.map(r => r.account_id))]
  const allDates   = [...new Set(rows.map(r => r.date))].sort()

  // Per-account sorted history
  const history: Record<number, { date: string; val: number }[]> = {}
  for (const id of accountIds) {
    history[id] = rows
      .filter(r => r.account_id === id)
      .map(r => ({ date: r.date, val: r.amount_base }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  // For each date, sum each account's last known value at or before that date
  const totals = allDates.map(d =>
    accountIds.reduce((sum, id) => {
      let last = 0
      for (const p of history[id]) {
        if (p.date <= d) last = p.val; else break
      }
      return sum + last
    }, 0)
  )

  return {
    x: allDates,
    y: totals,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Net Worth',
    line: { color: '#B8842B', width: 2.5, shape: 'spline' as const },
    marker: { color: '#F6F1E7', size: 6, line: { color: '#B8842B', width: 1.8 } },
    fill: 'tozeroy' as const,
    fillcolor: 'rgba(184,132,43,0.16)',
  }
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

function buildAllocationTrace(metrics: Metrics) {
  const sorted = [...metrics.byAccount].sort((a, b) => b.latest - a.latest)
  return [{
    labels: sorted.map(a => a.account),
    values: sorted.map(a => a.latest),
    type: 'pie' as const,
    hole: 0.6,
    marker: { colors: ACCOUNT_PALETTE, line: { color: '#F6F1E7', width: 2 } },
    textinfo: 'label+percent' as const,
    textfont: { size: 11, family: "'Hanken Grotesk', sans-serif" },
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]
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
  const [loading, setLoading]           = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.balances.list(),
      api.transactions.list(),
    ]).then(([b, t]) => {
      setBalances(b)
      setTransactions(t.slice(0, 8))
    }).finally(() => setLoading(false))
  }, [])

  const metrics       = useMemo(() => computeMetrics(balances), [balances])
  const netWorthTrace = useMemo(() => buildNetWorthTrace(balances), [balances])
  const accountTraces = useMemo(() => buildAccountTraces(balances), [balances])
  const allocTraces   = useMemo(() => buildAllocationTrace(metrics), [metrics])
  const delta        = metrics.totalNow - metrics.totalPrev
  const pct          = metrics.totalPrev ? (delta / metrics.totalPrev) * 100 : 0
  const invested     = metrics.totalNow - metrics.liquid

  if (loading) return <LoadingSpinner />

  if (!balances.length) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <Alert type="info">No balance data yet. Go to <strong>Accounts &amp; FX</strong> to add accounts, then record balance snapshots or import data.</Alert>
    </div>
  )

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
      <div className="hero-card" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div className="hero-eyebrow">Total net worth</div>
          <div className="hero-figure">{fmt(metrics.totalNow, metrics.currency)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16, flexWrap: 'wrap' }}>
            <span className="hero-delta-chip" style={delta < 0 ? { background: 'rgba(217,116,90,0.18)', color: '#E4937C' } : undefined}>
              {delta >= 0 ? '▲' : '▼'} {delta >= 0 ? '+' : ''}{fmt(delta, metrics.currency)} · {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--on-ink-muted)' }}>vs. previous snapshot</span>
          </div>
        </div>
        <div className="hero-side">
          <div>
            <div className="hero-side-label">Liquid</div>
            <div className="hero-side-value">{fmt(metrics.liquid, metrics.currency)}</div>
          </div>
          <div>
            <div className="hero-side-label">Invested</div>
            <div className="hero-side-value">{fmt(invested, metrics.currency)}</div>
          </div>
          {metrics.latestDate && (
            <div style={{ fontSize: '11.5px', color: 'var(--on-ink-faint)' }}>
              Updated {new Date(metrics.latestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </div>
          )}
        </div>
      </div>

      {/* Account tiles */}
      <div style={{ display: 'grid', gap: '13px', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', marginBottom: '30px' }}>
        {metrics.byAccount.map((a, i) => (
          <div
            key={a.account}
            className="account-tile card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate('/accounts')}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length], flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {a.accountType}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: 25, marginTop: 11, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(a.latest, a.currency)}
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {a.account} · {((a.latest / metrics.totalNow) * 100).toFixed(1)}%
            </div>
          </div>
        ))}
      </div>

      {/* Two-up row: net worth chart + allocation */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <div className="card">
          <div className="section-title" style={{ marginBottom: '6px' }}>Net Worth Over Time</div>
          <MoneyChart
            data={[netWorthTrace]}
            layout={{ yaxis: { tickformat: ',.0f' } }}
            style={{ height: 280 }}
          />
        </div>

        <div className="card">
          <div className="section-title">Allocation</div>
          <MoneyChart
            data={allocTraces}
            layout={{ showlegend: false, margin: { t: 10, b: 10, l: 10, r: 10 } }}
            style={{ height: 260 }}
          />
        </div>
      </div>

      {/* Accounts over time chart */}
      <div className="card" style={{ marginBottom: '18px' }}>
        <div className="section-title">Accounts Over Time</div>
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
        {transactions.length === 0 ? (
          <div style={{ padding: '1.5rem', color: 'var(--ink-faint)', textAlign: 'center', fontSize: '0.85rem' }}>
            No transactions yet
          </div>
        ) : (
          transactions.map(t => (
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
