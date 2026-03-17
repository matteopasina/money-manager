import { useState, useCallback, useEffect } from 'react'
import { api, type FireResult } from '../api/client'
import MoneyChart, { fmt } from '../components/MoneyChart'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

const DEFAULT_PARAMS = {
  target_amount: 1000000,
  annual_return_pct: 7,
  monthly_contribution: 0,
  withdrawal_rate_pct: 4,
  monthly_expenses: 0,
}

export default function GoalCalculator() {
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [data, setData]     = useState<FireResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const [detectedReturn, setDetectedReturn] = useState<number | null>(null)

  useEffect(() => {
    api.analytics.accountReturns().then(r => {
      const pct = r.weighted_annual_return_pct
      if (pct && pct > 0) {
        setDetectedReturn(pct)
        setParams(p => ({ ...p, annual_return_pct: Math.round(pct * 10) / 10 }))
      }
    }).catch(() => { /* non-fatal */ })
  }, [])

  const run = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.analytics.fire({
        target_amount: params.target_amount,
        annual_return_pct: params.annual_return_pct,
        monthly_contribution: params.monthly_contribution || undefined,
        withdrawal_rate_pct: params.withdrawal_rate_pct,
        monthly_expenses: params.monthly_expenses || undefined,
      })
      setData(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [params])

  useEffect(() => { run() }, [run])

  function field(label: string, key: keyof typeof params, min: number, max: number, step: number, suffix = '') {
    return (
      <div className="form-group">
        <label>{label}</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="range" min={min} max={max} step={step}
            value={params[key]}
            onChange={e => setParams(p => ({ ...p, [key]: Number(e.target.value) }))}
            style={{ flex: 1 }}
          />
          <input
            type="number" min={min} max={max} step={step}
            value={params[key]}
            onChange={e => setParams(p => ({ ...p, [key]: Number(e.target.value) }))}
            style={{ width: 100, textAlign: 'right' }}
          />
          {suffix && <span style={{ color: 'var(--text-muted)', minWidth: 20 }}>{suffix}</span>}
        </div>
      </div>
    )
  }

  const projectionTrace = data ? [{
    x: data.projection.map(p => p.date),
    y: data.projection.map(p => p.amount),
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'Projected Net Worth',
    line: { color: '#3d8ef8', width: 2 },
    fill: 'tozeroy' as const,
    fillcolor: 'rgba(61,142,248,0.07)',
  }, {
    x: data.projection.map(p => p.date),
    y: Array(data.projection.length).fill(data.fire_number),
    type: 'scatter' as const,
    mode: 'lines' as const,
    name: 'FIRE Target',
    line: { color: '#10d98e', width: 1.5, dash: 'dash' as const },
  }] : []

  return (
    <div>
      <div className="page-header">
        <h1>Goal Calculator</h1>
        <p>FIRE / investment target projections</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '1.5rem' }}>
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="section-title" style={{ marginBottom: '1rem' }}>Parameters</div>
          {field('Target Amount', 'target_amount', 0, 5000000, 10000, data?.currency ?? 'EUR')}
          {field('Annual Return', 'annual_return_pct', 0, 20, 0.5, '%')}
          {field('Monthly Contribution', 'monthly_contribution', 0, 10000, 100, data?.currency ?? 'EUR')}
          {field('Safe Withdrawal Rate', 'withdrawal_rate_pct', 1, 10, 0.1, '%')}
          {field('Monthly Expenses', 'monthly_expenses', 0, 10000, 100, data?.currency ?? 'EUR')}
        </div>

        <div>
          {error && <Alert type={error.startsWith('422') ? 'info' : 'error'}>{error}</Alert>}

          {loading ? (
            <LoadingSpinner />
          ) : data ? (
            <>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="card">
                  <div className="metric-label">Current Net Worth</div>
                  <div className="metric-value" style={{ fontSize: '1.3rem' }}>{fmt(data.current_nw, data.currency)}</div>
                </div>
                <div className="card">
                  <div className="metric-label">FIRE Number</div>
                  <div className="metric-value" style={{ fontSize: '1.3rem' }}>{fmt(data.fire_number, data.currency)}</div>
                </div>
                <div className="card">
                  <div className="metric-label">Target Amount</div>
                  <div className="metric-value" style={{ fontSize: '1.3rem' }}>{fmt(data.target_amount, data.currency)}</div>
                </div>
                <div className="card">
                  <div className="metric-label">Monthly Contribution</div>
                  <div className="metric-value" style={{ fontSize: '1.3rem' }}>{fmt(data.monthly_contribution, data.currency)}</div>
                </div>
                {data.years_to_target !== null && (
                  <div className="card">
                    <div className="metric-label">Years to Target</div>
                    <div className="metric-value" style={{ fontSize: '1.3rem', color: 'var(--accent-green)' }}>
                      {data.years_to_target.toFixed(1)}y
                    </div>
                  </div>
                )}
                {data.years_to_target === null && (
                  <div className="card">
                    <div className="metric-label">Status</div>
                    <div className="metric-value" style={{ fontSize: '1rem', color: 'var(--accent-amber)' }}>
                      Target not reached in projection window
                    </div>
                  </div>
                )}
              </div>

              {(data.detected_income != null || data.detected_expenses != null || data.detected_return_pct != null) && (
                <div className="card" style={{ marginBottom: '1.5rem', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                  <div className="section-title" style={{ marginBottom: '0.75rem', fontSize: '0.82rem' }}>Detected from your data</div>
                  <table style={{ fontSize: '0.84rem' }}>
                    <tbody>
                      {data.detected_income != null && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)', paddingRight: '1.5rem', paddingBottom: '0.25rem' }}>Monthly income</td>
                          <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.detected_income, data.currency)}</td>
                        </tr>
                      )}
                      {data.detected_expenses != null && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)', paddingRight: '1.5rem', paddingBottom: '0.25rem' }}>Monthly expenses</td>
                          <td style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.detected_expenses, data.currency)}</td>
                        </tr>
                      )}
                      {data.detected_return_pct != null && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)', paddingRight: '1.5rem', paddingBottom: '0.25rem' }}>Portfolio return</td>
                          <td style={{ fontWeight: 600, color: data.detected_return_pct >= 5 ? 'var(--accent-green)' : data.detected_return_pct >= 1 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                            {data.detected_return_pct >= 0 ? '+' : ''}{data.detected_return_pct.toFixed(1)}%/yr
                          </td>
                        </tr>
                      )}
                      {data.detected_income != null && data.detected_expenses != null && (
                        <tr>
                          <td style={{ color: 'var(--text-muted)', paddingRight: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.25rem' }}>→ Contribution</td>
                          <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', borderTop: '1px solid var(--border)', paddingTop: '0.25rem' }}>
                            {fmt(Math.max(0, data.detected_income - data.detected_expenses), data.currency)}/mo
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {detectedReturn != null && (
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.5rem 0 0' }}>
                      Annual return pre-filled from your actual portfolio CAGR ({detectedReturn.toFixed(1)}%/yr)
                    </p>
                  )}
                </div>
              )}

              <div className="section-title">Projection</div>
              <div className="card">
                <MoneyChart
                  data={projectionTrace}
                  layout={{ yaxis: { tickformat: ',.0f' } }}
                  style={{ height: 360 }}
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
