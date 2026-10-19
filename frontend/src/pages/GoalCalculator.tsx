import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import MoneyChart from '../components/MoneyChart'
import { fmt } from '../utils/money'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { useApi } from '../hooks/useApi'

const DEFAULT_PARAMS = {
  target_amount: 1000000,
  annual_return_pct: 7,
  monthly_contribution: 0,
  withdrawal_rate_pct: 4,
  monthly_expenses: 0,
}

// Fields the backend can auto-detect from transaction history when omitted.
// Untouched, they track the backend's resolved value; the first slider/input
// interaction "touches" the field and its literal value (including 0) is sent.
type AutoKey = 'monthly_contribution' | 'monthly_expenses'

export default function GoalCalculator() {
  const navigate = useNavigate()
  const [params, setParams] = useState(DEFAULT_PARAMS)
  const [touched, setTouched] = useState<Record<AutoKey, boolean>>({ monthly_contribution: false, monthly_expenses: false })

  // Debounced + race-safe: dragging a slider fires this on every tick, but
  // only the latest response after a ~300ms pause is ever applied.
  const { data, loading, error } = useApi(
    () => api.analytics.fire({
      target_amount: params.target_amount,
      annual_return_pct: params.annual_return_pct,
      monthly_contribution: touched.monthly_contribution ? params.monthly_contribution : undefined,
      withdrawal_rate_pct: params.withdrawal_rate_pct,
      monthly_expenses: touched.monthly_expenses ? params.monthly_expenses : undefined,
    }),
    [
      params.target_amount, params.annual_return_pct, params.withdrawal_rate_pct,
      touched.monthly_contribution, touched.monthly_expenses,
      touched.monthly_contribution ? params.monthly_contribution : null,
      touched.monthly_expenses ? params.monthly_expenses : null,
    ],
    300,
  )

  const detectedReturn = data?.detected_return_pct ?? null

  // Keep untouched sliders tracking the backend's resolved (auto-detected)
  // value, so the first drag starts from a realistic number instead of 0.
  useEffect(() => {
    if (!data) return
    setParams(p => {
      const contribution = touched.monthly_contribution ? p.monthly_contribution : data.monthly_contribution
      const expenses = touched.monthly_expenses ? p.monthly_expenses : data.monthly_expenses
      if (contribution === p.monthly_contribution && expenses === p.monthly_expenses) return p
      return { ...p, monthly_contribution: contribution, monthly_expenses: expenses }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  function field(label: string, key: keyof typeof params, min: number, max: number, step: number, suffix = '', autoKey?: AutoKey) {
    const isAuto = autoKey != null && !touched[autoKey]
    function onChange(value: string) {
      // An emptied number input must not silently become 0 — clamp to the
      // field's own minimum instead (e.g. withdrawal rate can't go below 1%).
      const num = value === '' ? min : Number(value)
      setParams(p => ({ ...p, [key]: isNaN(num) ? min : num }))
      if (autoKey) setTouched(t => ({ ...t, [autoKey]: true }))
    }
    return (
      <div className="form-group">
        <label>
          {label}
          {isAuto && <span style={{ color: 'var(--ink-faint)', fontWeight: 400 }}> · auto-detected</span>}
          {autoKey && touched[autoKey] && (
            <button
              type="button" className="btn-link"
              style={{ fontSize: '0.75rem', marginLeft: 8 }}
              onClick={() => setTouched(t => ({ ...t, [autoKey]: false }))}
            >
              Ripristina dai dati
            </button>
          )}
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <input
            type="range" min={min} max={max} step={step}
            value={params[key]}
            onChange={e => onChange(e.target.value)}
            style={{ flex: 1 }}
          />
          <input
            type="number" min={min} max={max} step={step}
            value={params[key]}
            onChange={e => onChange(e.target.value)}
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

  const hasDetected = Boolean(data && (
    data.detected_income != null ||
    data.detected_expenses != null ||
    data.detected_return_pct != null
  ))
  const targetProgress = data && data.target_amount > 0
    ? Math.max(0, Math.min(100, (data.current_nw / data.target_amount) * 100))
    : 0
  const targetGap = data ? Math.max(0, data.target_amount - data.current_nw) : 0

  function askHelper(focus: string) {
    if (!data) return
    const targetTiming = data.years_to_target === null
      ? 'not reached in the projection window'
      : `${data.years_to_target.toFixed(1)} years`
    const prompt = [
      `Review my goal planner scenario and focus on: ${focus}.`,
      `Current net worth: ${fmt(data.current_nw, data.currency)}.`,
      `Target amount: ${fmt(data.target_amount, data.currency)}.`,
      `FIRE number: ${fmt(data.fire_number, data.currency)}.`,
      `Monthly contribution: ${fmt(data.monthly_contribution, data.currency)}.`,
      `Annual return assumption: ${params.annual_return_pct}%.`,
      `Safe withdrawal rate: ${params.withdrawal_rate_pct}%.`,
      `Spese mensili: ${fmt(params.monthly_expenses, data.currency)}.`,
      `Time to target: ${targetTiming}.`,
      'Explain the tradeoffs, the weakest assumption, and one realistic adjustment to try next.',
    ].join('\n')
    navigate('/financial-helper', { state: { prompt, sourcePath: '/projections' } })
  }

  return (
    <div className="goal-planner-page">
      {error && <Alert type={error.startsWith('422') ? 'info' : 'error'}>{error}</Alert>}

      {loading && !data && <LoadingSpinner />}

      {data && (
        <>
          <section className="goal-planner-hero">
            <div className="goal-planner-hero-copy">
              <div className="goal-planner-kicker">Pianifica un obiettivo</div>
              <h2>
                {data.years_to_target === null
                  ? 'Obiettivo oltre l’orizzonte della simulazione'
                  : `${data.years_to_target.toFixed(1)} anni all’obiettivo`}
              </h2>
              <p>
                {fmt(targetGap, data.currency)} per raggiungere {fmt(data.target_amount, data.currency)} con un rendimento annuale ipotizzato del {params.annual_return_pct}%.
              </p>
              <div className="goal-progress-track">
                <div className="goal-progress-fill" style={{ width: `${targetProgress}%` }} />
              </div>
            </div>
            <div className="goal-planner-hero-stats">
              <div>
                <span>Attuale</span>
                <strong>{fmt(data.current_nw, data.currency)}</strong>
              </div>
              <div>
                <span>Obiettivo</span>
                <strong>{fmt(data.target_amount, data.currency)}</strong>
              </div>
              <div>
                <span>Capitale per indipendenza</span>
                <strong>{fmt(data.fire_number, data.currency)}</strong>
              </div>
              <div>
                <span>Versamento mensile</span>
                <strong>{fmt(data.monthly_contribution, data.currency)}</strong>
              </div>
            </div>
          </section>

          <div className="goal-planner-workspace">
            <section className="card goal-planner-controls">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Parametri</div>
              {field('Capitale obiettivo', 'target_amount', 0, 5000000, 10000, data.currency)}
              {field('Rendimento annuale', 'annual_return_pct', 0, 20, 0.5, '%')}
              {field('Versamento mensile', 'monthly_contribution', 0, 10000, 100, data.currency, 'monthly_contribution')}
              {field('Tasso di prelievo', 'withdrawal_rate_pct', 1, 10, 0.1, '%')}
              {field('Spese mensili', 'monthly_expenses', 0, 10000, 100, data.currency, 'monthly_expenses')}
            </section>

            <section className="goal-planner-side-stack">
              <div className="card goal-detected-card">
                <div className="goal-planner-kicker">Dai tuoi dati</div>
                {hasDetected ? (
                  <div className="goal-detected-list">
                    {data.detected_income != null && (
                      <div className="goal-detected-row">
                        <span>Entrate mensili</span>
                        <strong>{fmt(data.detected_income, data.currency)}</strong>
                      </div>
                    )}
                    {data.detected_expenses != null && (
                      <div className="goal-detected-row">
                        <span>Spese mensili</span>
                        <strong>{fmt(data.detected_expenses, data.currency)}</strong>
                      </div>
                    )}
                    {data.detected_return_pct != null && (
                      <div className="goal-detected-row">
                        <span>Rendimento del portafoglio</span>
                        <strong className={data.detected_return_pct >= 5 ? 'positive' : data.detected_return_pct >= 1 ? 'watch' : ''}>
                          {data.detected_return_pct >= 0 ? '+' : ''}{data.detected_return_pct.toFixed(1)}%/yr
                        </strong>
                      </div>
                    )}
                    {data.detected_income != null && data.detected_expenses != null && (
                      <div className="goal-detected-row emphasized">
                        <span>Versamento rilevato</span>
                        <strong>{fmt(Math.max(0, data.detected_income - data.detected_expenses), data.currency)}/mo</strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="goal-muted-copy">Aggiungi movimenti classificati e uno storico dei saldi per ricavare le ipotesi dai dati.</p>
                )}
                {detectedReturn != null && (
                  <p className="goal-muted-copy">
                    Rendimento annualizzato registrato: {detectedReturn.toFixed(1)}%. La proiezione usa il rendimento che scegli per lo scenario.
                  </p>
                )}
              </div>

              <div className="projection-ai-card goal-ai-card">
                <div>
                  <div className="projection-ai-title"><Sparkles size={16} /> Approfondisci questo piano</div>
                  <p>Approfondisci queste ipotesi e i tempi previsti con l’assistente.</p>
                </div>
                <div className="projection-ai-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => askHelper('whether this target plan is realistic')}>
                    Verifica le ipotesi <ArrowRight size={13} />
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => askHelper('how to reach the target sooner')}>
                    Reach sooner <ArrowRight size={13} />
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => askHelper('how sensitive this plan is to returns and contributions')}>
                    Stress test <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </section>
          </div>

          <section>
            <div className="section-title">Proiezione</div>
            <div className="card projection-chart-card">
              <MoneyChart
                data={projectionTrace}
                layout={{ yaxis: { tickformat: ',.0f' } }}
                style={{ height: 390 }}
              />
            </div>
          </section>
        </>
      )}
    </div>
  )
}
