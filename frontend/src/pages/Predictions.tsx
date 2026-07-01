import { useEffect, useState, useCallback } from 'react'
import { api, type ForecastResult, type AccountReturnsResult } from '../api/client'
import MoneyChart, { RANGE_XAXIS, fmt } from '../components/MoneyChart'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { ACCOUNT_TYPE_BADGE } from '../constants'

function returnColor(pct: number): string {
  if (pct >= 5) return 'var(--accent-green)'
  if (pct >= 1) return 'var(--accent-amber)'
  if (pct >= 0) return 'var(--text-muted)'
  return 'var(--danger)'
}

export default function Predictions() {
  const [monthsAhead, setMonthsAhead]           = useState(12)
  const [data, setData]                          = useState<ForecastResult | null>(null)
  const [returns, setReturns]                    = useState<AccountReturnsResult | null>(null)
  const [loading, setLoading]                    = useState(true)
  const [error, setError]                        = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [forecast, accountReturns] = await Promise.allSettled([
        api.analytics.forecast(monthsAhead),
        api.analytics.accountReturns(),
      ])
      if (forecast.status === 'fulfilled') setData(forecast.value)
      else setError(forecast.reason instanceof Error ? forecast.reason.message : String(forecast.reason))
      if (accountReturns.status === 'fulfilled') setReturns(accountReturns.value)
      // account-returns failure is non-fatal — insights section just won't show
    } finally {
      setLoading(false)
    }
  }, [monthsAhead])

  useEffect(() => { load() }, [load])

  const traces = data ? [
    {
      x: data.historical.map(p => p.date),
      y: data.historical.map(p => p.amount),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: 'Historical',
      line: { color: '#B8842B', width: 2.5 },
      marker: { color: '#F6F1E7', size: 6, line: { color: '#B8842B', width: 1.8 } },
    },
    {
      x: data.forecast.map(p => p.date),
      y: data.forecast.map(p => p.amount),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Forecast',
      line: { color: '#3F7A55', width: 2.5, dash: 'dash' as const },
    },
  ] : []

  return (
    <div>
      <div className="card" style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '22px', padding: '18px 22px' }}>
        <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Months to forecast</span>
        <input
          type="range" min={3} max={60} step={3}
          value={monthsAhead}
          onChange={e => setMonthsAhead(Number(e.target.value))}
          style={{ flex: 1, maxWidth: 360 }}
        />
        <span style={{ fontWeight: 700, fontSize: 22, color: 'var(--ink)', minWidth: 54, fontVariantNumeric: 'tabular-nums' }}>{monthsAhead}M</span>
      </div>

      {error && <Alert type={error.startsWith('422') ? 'info' : 'error'}>{error}</Alert>}

      {loading ? (
        <LoadingSpinner />
      ) : data ? (
        <>
          <div className="metrics-grid" style={{ marginBottom: '18px' }}>
            <div className="card">
              <div className="metric-label">Monthly growth</div>
              <div className="metric-value" style={{ marginTop: '8px', color: data.monthly_growth >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                {data.monthly_growth >= 0 ? '+' : ''}{fmt(data.monthly_growth, data.currency)}
              </div>
            </div>
            {data.forecast.length > 0 && (
              <div className="card">
                <div className="metric-label">Forecast in {monthsAhead}M</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {fmt(data.forecast[data.forecast.length - 1].amount, data.currency)}
                </div>
              </div>
            )}
            {data.historical.length > 0 && (
              <div className="card">
                <div className="metric-label">Current net worth</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {fmt(data.historical[data.historical.length - 1].amount, data.currency)}
                </div>
              </div>
            )}
            {returns && (
              <div className="card card-dark">
                <div className="metric-label">Portfolio return</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {returns.weighted_annual_return_pct >= 0 ? '+' : ''}{returns.weighted_annual_return_pct.toFixed(1)}%
                  <span style={{ fontSize: 15, color: 'var(--on-ink-faint)', fontWeight: 600 }}>/yr</span>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '18px' }}>
            <div className="section-title">Net Worth Forecast</div>
            <MoneyChart
              data={traces}
              layout={{ xaxis: RANGE_XAXIS, yaxis: { tickformat: ',.0f' } }}
              style={{ height: 380 }}
            />
          </div>

          {returns && returns.by_type.length > 0 && (
            <>
              <div className="card">
                <div className="section-title">Portfolio Insights</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginBottom: '1rem' }}>
                  Deposit-adjusted return per account type (Modified Dietz). Salary, transfers, and other cash flows are subtracted so only organic growth (interest / investment gains) is shown.
                  {returns.by_type.some(t => t.annual_return_pct !== 0 && returns.accounts.find(a => a.account_type === t.account_type && a.data_points < 3)) && (
                    <> Some estimates are based on limited snapshots — add more balance records for accuracy.</>
                  )}
                </p>

                <table>
                  <thead>
                    <tr>
                      <th>Account type</th>
                      <th style={{ textAlign: 'right' }}>Balance</th>
                      <th style={{ textAlign: 'right' }}>Annual return</th>
                      <th style={{ textAlign: 'right' }}>Monthly return</th>
                      <th>Accounts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.by_type.map(t => {
                      const badge = ACCOUNT_TYPE_BADGE[t.account_type] ?? ACCOUNT_TYPE_BADGE.other
                      const accsOfType = returns.accounts.filter(a => a.account_type === t.account_type)
                      const monthlyPct = ((1 + t.annual_return_pct / 100) ** (1 / 12) - 1) * 100
                      return (
                        <tr key={t.account_type}>
                          <td>
                            <span style={{ background: badge.bg, color: badge.color, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 }}>
                              {t.account_type}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                            {fmt(t.total_balance, returns.currency)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: returnColor(t.annual_return_pct) }}>
                            {t.annual_return_pct >= 0 ? '+' : ''}{t.annual_return_pct.toFixed(1)}%
                          </td>
                          <td style={{ textAlign: 'right', color: returnColor(monthlyPct) }}>
                            {monthlyPct >= 0 ? '+' : ''}{monthlyPct.toFixed(2)}%
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
                            {accsOfType.map(a => a.account).join(', ')}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                <div style={{ margin: '14px 0 4px', padding: '13px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.5 }}>
                  Your portfolio earns <strong style={{ color: returnColor(returns.weighted_annual_return_pct) }}>{returns.weighted_annual_return_pct >= 0 ? '+' : ''}{returns.weighted_annual_return_pct.toFixed(1)}%/yr</strong> organically (weighted by balance, cash-flow adjusted).
                  {' '}The Goal Planner tab uses this rate as the default for compound projections.
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {!loading && !data && !error && (
        <Alert type="info">No balance data available for forecasting.</Alert>
      )}
    </div>
  )
}
