import { Link } from 'react-router-dom'
import { fmt } from '../../utils/money'
import { formatDateLabel } from '../../utils/date'
import type { Metrics } from './data'

interface Props {
  metrics: Metrics
  baseCurrency: string
  spark: { line: string; area: string } | null
}

export default function HeroCard({ metrics: m, baseCurrency: currency, spark }: Props) {
  return (
    <section className="hero-card" aria-label="Net worth summary">
      {spark && <svg className="hero-spark" viewBox="0 0 300 76" preserveAspectRatio="none" aria-hidden="true"><path d={spark.line} fill="none" stroke="currentColor" strokeWidth="1.4" vectorEffect="non-scaling-stroke" /></svg>}
      <div className="hero-main">
        <div className="hero-eyebrow">Total net worth · {currency}</div>
        <div className="hero-figure">{fmt(m.totalNow, currency)}</div>
        {m.comparisons.map(period => <div className="hero-comparison" key={period.label}>
          {period.delta !== null ? <span className={`hero-delta-chip${period.delta < 0 ? ' negative' : ''}`}>
            {period.delta > 0 ? '+' : ''}{fmt(period.delta, currency)}{period.pct !== null && ` · ${period.pct > 0 ? '+' : ''}${period.pct.toFixed(2)}%`}
          </span> : <span>Not enough history</span>}
          <span>vs. {period.label} ({formatDateLabel(period.date)}){period.accounts < m.accountCount && ` · ${period.accounts}/${m.accountCount} accounts`}</span>
        </div>)}
        <div className="hero-footnote">{m.accountCount} tracked {m.accountCount === 1 ? 'account' : 'accounts'} · Latest known balances at each date. Changes include deposits and withdrawals.</div>
      </div>
      <div className="hero-side">
        <div><div className="hero-side-label">Liquid balances</div><div className="hero-side-value">{fmt(m.liquid, currency)}</div></div>
        <div><div className="hero-side-label">Other balances</div><div className="hero-side-value">{fmt(m.totalNow - m.liquid, currency)}</div></div>
        <Link className="hero-details-link" to="/balances">Review snapshots →</Link>
      </div>
      <div className="hero-freshness">
        <span>Snapshot dates: {formatDateLabel(m.oldestDate, { withYear: true })}{m.oldestDate !== m.latestDate && ` – ${formatDateLabel(m.latestDate, { withYear: true })}`}</span>
      </div>
    </section>
  )
}
