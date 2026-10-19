import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { api, type ForecastResult, type AccountReturnsResult } from '../api/client'
import MoneyChart, { RANGE_XAXIS } from '../components/MoneyChart'
import { fmt } from '../utils/money'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { ACCOUNT_TYPE_BADGE } from '../constants'
import { useApi } from '../hooks/useApi'

function returnColor(pct: number): string {
  if (pct >= 5) return 'var(--accent-green)'
  if (pct >= 1) return 'var(--accent-amber)'
  if (pct >= 0) return 'var(--text-muted)'
  return 'var(--danger)'
}

export default function Predictions() {
  const navigate = useNavigate()
  const [monthsAhead, setMonthsAhead] = useState(12)

  // Debounced + race-safe: dragging the horizon slider fires this on every
  // tick, but only the latest response after a ~250ms pause is applied.
  // account-returns failure is non-fatal — the insights section just won't show.
  const { data: result, loading, error } = useApi<[ForecastResult, AccountReturnsResult | null]>(
    async () => {
      const [forecast, accountReturns] = await Promise.allSettled([
        api.analytics.forecast(monthsAhead),
        api.analytics.accountReturns(),
      ])
      if (forecast.status === 'rejected') {
        throw forecast.reason instanceof Error ? forecast.reason : new Error(String(forecast.reason))
      }
      return [forecast.value, accountReturns.status === 'fulfilled' ? accountReturns.value : null]
    },
    [monthsAhead],
    250,
  )
  const data = result ? result[0] : null
  const returns = result ? result[1] : null

  const traces = data ? [
    {
      x: data.historical.map(p => p.date),
      y: data.historical.map(p => p.amount),
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: 'Storico',
      line: { color: '#B8842B', width: 2.5 },
      marker: { color: '#F6F1E7', size: 6, line: { color: '#B8842B', width: 1.8 } },
    },
    {
      x: data.forecast.map(p => p.date),
      y: data.forecast.map(p => p.amount),
      type: 'scatter' as const,
      mode: 'lines' as const,
      name: 'Previsione',
      line: { color: '#3F7A55', width: 2.5, dash: 'dash' as const },
    },
  ] : []

  function askHelper(focus: string) {
    if (!data) return
    const current = data.historical.length ? data.historical[data.historical.length - 1].amount : null
    const forecast = data.forecast.length ? data.forecast[data.forecast.length - 1].amount : null
    const returnLine = returns
      ? `\nRendimento storico stimato: ${returns.weighted_annual_return_pct.toFixed(1)}%/yr cash-flow adjusted.`
      : ''
    const prompt = [
      `Review my net worth forecast and focus on: ${focus}.`,
      `Horizon: ${monthsAhead} months.`,
      `Patrimonio attuale: ${current == null ? 'unknown' : fmt(current, data.currency)}.`,
      `Forecast end value: ${forecast == null ? 'unknown' : fmt(forecast, data.currency)}.`,
      `Estimated monthly growth: ${fmt(data.monthly_growth, data.currency)}.${returnLine}`,
      'Explain the assumptions, what could make the forecast wrong, and the next best action.',
    ].join('\n')
    navigate('/financial-helper', { state: { prompt, sourcePath: '/projections' } })
  }

  return (
    <div>
      <div className="card projection-control-card">
        <span style={{ fontSize: 13, color: 'var(--ink-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Orizzonte in mesi</span>
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
              <div className="metric-label">Crescita mensile</div>
              <div className="metric-value" style={{ marginTop: '8px', color: data.monthly_growth >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
                {data.monthly_growth >= 0 ? '+' : ''}{fmt(data.monthly_growth, data.currency)}
              </div>
            </div>
            {data.forecast.length > 0 && (
              <div className="card">
                <div className="metric-label">Previsione a {monthsAhead} mesi</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {fmt(data.forecast[data.forecast.length - 1].amount, data.currency)}
                </div>
              </div>
            )}
            {data.historical.length > 0 && (
              <div className="card">
                <div className="metric-label">Patrimonio attuale</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {fmt(data.historical[data.historical.length - 1].amount, data.currency)}
                </div>
              </div>
            )}
            {returns && (
              <div className="card card-dark">
                <div className="metric-label">Rendimento storico stimato</div>
                <div className="metric-value" style={{ marginTop: '8px' }}>
                  {returns.weighted_annual_return_pct >= 0 ? '+' : ''}{returns.weighted_annual_return_pct.toFixed(1)}%
                  <span style={{ fontSize: 15, color: 'var(--on-ink-faint)', fontWeight: 600 }}>/anno</span>
                </div>
              </div>
            )}
          </div>

          <div className="projection-ai-card">
            <div>
              <div className="projection-ai-title"><Sparkles size={16} /> Approfondisci con Fuoco</div>
              <p>Porta questi dati all’assistente per approfondire ipotesi e risultati.</p>
            </div>
            <div className="projection-ai-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => askHelper('whether this forecast is realistic')}>
                Verifica le ipotesi <ArrowRight size={13} />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => askHelper('what would improve the forecast fastest')}>
                Esplora alternative <ArrowRight size={13} />
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => askHelper('the biggest risks in this projection')}>
                Rischi <ArrowRight size={13} />
              </button>
            </div>
          </div>

          <div className="card projection-chart-card" style={{ marginBottom: '18px' }}>
            <div className="section-title">Previsione del patrimonio</div>
            <MoneyChart
              data={traces}
              layout={{ xaxis: RANGE_XAXIS, yaxis: { tickformat: ',.0f' } }}
              style={{ height: 380 }}
            />
          </div>

          {returns && returns.by_type.length > 0 && (
            <>
              <div className="card">
                <div className="section-title">Rendimenti del portafoglio</div>
                <p style={{ fontSize: '0.82rem', color: 'var(--ink-faint)', marginBottom: '1rem' }}>
                  Rendimento per tipo di conto corretto per i flussi esterni (Modified Dietz), pesati secondo la data. Compravendite e dividendi restano nel rendimento dei conti di investimento. Le stime dipendono dalla completezza dei saldi e dei versamenti.
                  {returns.by_type.some(t => t.annual_return_pct !== 0 && returns.accounts.find(a => a.account_type === t.account_type && a.data_points < 3)) && (
                    <> Some estimates are based on limited snapshots — add more balance records for accuracy.</>
                  )}
                </p>

                <table>
                  <thead>
                    <tr>
                      <th>Tipo di conto</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th style={{ textAlign: 'right' }}>Rendimento annuale</th>
                      <th style={{ textAlign: 'right' }}>Rendimento mensile</th>
                      <th>Conti</th>
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
                  Recorded annualized return: <strong style={{ color: returnColor(returns.weighted_annual_return_pct) }}>{returns.weighted_annual_return_pct >= 0 ? '+' : ''}{returns.weighted_annual_return_pct.toFixed(1)}%/yr</strong> (weighted by current balance, using each account’s recorded period).
                  {' '}The Goal Planner uses a separate scenario rate; past returns are not a forecast.
                </div>
              </div>
            </>
          )}
        </>
      ) : null}

      {!loading && !data && !error && (
        <Alert type="info">Aggiungi uno storico dei saldi per vedere le previsioni.</Alert>
      )}
    </div>
  )
}
