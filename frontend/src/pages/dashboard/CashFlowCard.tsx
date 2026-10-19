import { Link } from 'react-router-dom'
import { fmt } from '../../utils/money'
import { formatMonthLabel } from '../../utils/date'
import type { MonthSummary } from './data'

export default function CashFlowCard({ summary, currency }: { summary: MonthSummary; currency: string }) {
  const top = summary.categories.slice(0, 5)
  const remainder = summary.categories.slice(5).reduce((sum, c) => sum + c.amount, 0)
  const rows = remainder ? [...top, { name: 'Other categories', amount: remainder, color: 'var(--ink-muted)' }] : top
  return (
    <section className="card spending-card" aria-labelledby="spending-heading">
      <div className="dashboard-section-header">
        <div>
          <h2 id="spending-heading">Where your money went</h2>
          <p>{formatMonthLabel(summary.month, { withYear: true })} · {summary.categories.length} spending categories</p>
        </div>
        <Link className="btn-link" to="/transactions">View transactions →</Link>
      </div>
      {rows.length ? <ul className="spending-list">
        {rows.map(row => <li key={row.name}>
          <div className="spending-label"><span>{row.name}</span><strong>{fmt(row.amount, currency)} <small>{(row.amount / summary.spending * 100).toFixed(0)}%</small></strong></div>
          <div className="spending-track" aria-hidden="true"><div style={{ width: `${row.amount / summary.spending * 100}%`, background: row.color }} /></div>
        </li>)}
      </ul> : <div className="dashboard-empty"><p>No spending recorded for this month.</p><Link className="btn btn-secondary" to="/import">Import transactions</Link></div>}
      {summary.uncategorizedCount > 0 && <div className="dashboard-note">
        {fmt(summary.uncategorizedSpend, currency)} in {summary.uncategorizedCount} uncategorized expenses.
        {' '}<Link to="/transactions?uncategorized=1">Review categories →</Link>
      </div>}
    </section>
  )
}
