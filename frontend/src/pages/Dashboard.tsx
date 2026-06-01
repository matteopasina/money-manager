import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type BalanceRow, type TransactionRow } from '../api/client'
import MoneyChart, { RANGE_XAXIS, ACCOUNT_PALETTE, fmt, fmtAmount } from '../components/MoneyChart'
import { ACCOUNT_TYPE_BADGE } from '../constants'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

interface Metrics {
  totalNow: number
  totalPrev: number
  currency: string
  latestDate: string
  byAccount: { account: string; latest: number; currency: string; accountType: string }[]
}

function computeMetrics(rows: BalanceRow[]): Metrics {
  if (!rows.length) return { totalNow: 0, totalPrev: 0, currency: 'EUR', latestDate: '', byAccount: [] }

  const dates = [...new Set(rows.map(r => r.date))].sort()
  const latestDate = dates[dates.length - 1]
  const prevDate   = dates[dates.length - 2] ?? latestDate

  const latest = rows.filter(r => r.date === latestDate)
  const prev   = rows.filter(r => r.date === prevDate)

  const totalNow  = latest.reduce((s, r) => s + r.amount_base, 0)
  const totalPrev = prev.reduce((s, r) => s + r.amount_base, 0)

  const byAccount = Object.values(
    latest.reduce<Record<string, { account: string; latest: number; currency: string; accountType: string }>>((acc, r) => {
      acc[r.account] = { account: r.account, latest: r.amount_base, currency: r.currency, accountType: r.account_type }
      return acc
    }, {})
  ).sort((a, b) => b.latest - a.latest)

  return { totalNow, totalPrev, currency: 'EUR', latestDate, byAccount }
}

function buildNetWorthTrace(rows: BalanceRow[]) {
  const byDate = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.date] = (acc[r.date] ?? 0) + r.amount_base
    return acc
  }, {})
  const dates = Object.keys(byDate).sort()
  return {
    x: dates,
    y: dates.map(d => byDate[d]),
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Net Worth',
    line: { color: '#3b82f6', width: 2.5 },
    fill: 'tozeroy' as const,
    fillcolor: 'rgba(59,130,246,0.06)',
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
    hole: 0.52,
    marker: { colors: ACCOUNT_PALETTE, line: { color: '#ffffff', width: 2 } },
    textinfo: 'label+percent' as const,
    textfont: { size: 11 },
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]
}

function accountTypeBadgeStyle(type: string): React.CSSProperties {
  const style = ACCOUNT_TYPE_BADGE[type?.toLowerCase()] ?? ACCOUNT_TYPE_BADGE.other
  return { background: style.bg, color: style.color, padding: '1px 7px', borderRadius: 99, fontSize: '0.68rem', fontWeight: 600 }
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

  if (loading) return <LoadingSpinner />

  if (!balances.length) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <Alert type="info">No balance data yet. Go to <strong>Accounts &amp; FX</strong> to add accounts, then record balance snapshots or import data.</Alert>
    </div>
  )

  return (
    <div>
      {/* Hero — net worth */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1.5rem 2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="metric-label" style={{ marginBottom: '0.4rem' }}>Total Net Worth</div>
            <div style={{ fontSize: '2.6rem', fontWeight: 800, color: 'var(--text-bright)', letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(metrics.totalNow, metrics.currency)}
            </div>
            <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className={`metric-delta ${delta >= 0 ? 'delta-up' : 'delta-down'}`} style={{ fontSize: '0.9rem' }}>
                {delta >= 0 ? '▲' : '▼'} {fmt(Math.abs(delta), metrics.currency)} ({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>vs previous snapshot</span>
            </div>
          </div>
          {metrics.latestDate && (
            <div style={{ textAlign: 'right' }}>
              <div className="metric-label">Last updated</div>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginTop: '0.2rem' }}>
                {new Date(metrics.latestDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Account cards */}
      <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', marginBottom: '1.5rem' }}>
        {metrics.byAccount.map((a, i) => (
          <div
            key={a.account}
            className="card"
            style={{ cursor: 'pointer', borderTop: `3px solid ${ACCOUNT_PALETTE[i % ACCOUNT_PALETTE.length]}` }}
            onClick={() => navigate('/accounts')}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div className="metric-label" style={{ fontSize: '0.72rem', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.account}</div>
              <span style={accountTypeBadgeStyle(a.accountType)}>{a.accountType}</span>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-bright)', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(a.latest, a.currency)}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
              {((a.latest / metrics.totalNow) * 100).toFixed(1)}% of total
            </div>
          </div>
        ))}
      </div>

      {/* Net worth chart */}
      <div className="section-title">Net Worth Over Time</div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <MoneyChart
          data={[netWorthTrace]}
          layout={{ xaxis: RANGE_XAXIS, yaxis: { tickformat: ',.0f' } }}
          style={{ height: 300 }}
        />
      </div>

      {/* Accounts over time chart */}
      <div className="section-title">Accounts Over Time</div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <MoneyChart
          data={accountTraces}
          layout={{ xaxis: RANGE_XAXIS, yaxis: { tickformat: ',.0f' }, showlegend: true }}
          style={{ height: 300 }}
        />
      </div>

      {/* Bottom row: allocation + recent transactions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem' }}>
        <div>
          <div className="section-title">Allocation</div>
          <div className="card" style={{ height: '100%' }}>
            <MoneyChart
              data={allocTraces}
              layout={{ showlegend: false, margin: { t: 10, b: 10, l: 10, r: 10 } }}
              style={{ height: 260 }}
            />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Recent Transactions</div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => navigate('/transactions')}
            >
              View all →
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            {transactions.length === 0 ? (
              <div style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                No transactions yet
              </div>
            ) : (
              <table style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={t.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t.date}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.description}>
                        {t.description}
                      </td>
                      <td>
                        {t.category ? (
                          <span className="badge" style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                            {t.category}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: t.amount >= 0 ? 'var(--accent-green)' : 'var(--text-bright)', whiteSpace: 'nowrap' }}>
                        {t.amount >= 0 ? '+' : ''}{fmtAmount(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
