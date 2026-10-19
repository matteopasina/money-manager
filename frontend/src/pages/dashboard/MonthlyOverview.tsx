import { ArrowDownLeft, ArrowUpRight, PiggyBank, Wallet } from 'lucide-react'
import { fmt } from '../../utils/money'
import { formatMonthLabel } from '../../utils/date'
import type { MonthSummary } from './data'

interface Props {
  summary: MonthSummary
  months: string[]
  currency: string
  onMonthChange: (month: string) => void
}

export default function MonthlyOverview({ summary: s, months, currency, onMonthChange }: Props) {
  const difference = s.previousSpending === null ? null : s.spending - s.previousSpending
  const comparison = difference === null ? 'No comparable records last month'
    : `${fmt(Math.abs(difference), currency)} ${difference > 0 ? 'more' : difference < 0 ? 'less' : 'change'} ${s.comparisonLabel}`
  return (
    <section className="monthly-overview" aria-labelledby="monthly-heading">
      <div className="dashboard-section-header">
        <div>
          <h2 id="monthly-heading">Your month at a glance</h2>
          <p>Recorded cash flow · transfers excluded · {currency}</p>
        </div>
        <label className="month-picker">
          <span>Month</span>
          <select value={s.month} onChange={e => onMonthChange(e.target.value)}>
            {months.map(month => <option key={month} value={month}>{formatMonthLabel(month, { withYear: true })}</option>)}
          </select>
        </label>
      </div>
      <div className="monthly-metrics" aria-live="polite">
        <div className="monthly-metric">
          <span className="monthly-metric-label"><ArrowDownLeft size={16} aria-hidden="true" /> Money in</span>
          <strong>{s.count ? fmt(s.income, currency) : '—'}</strong>
          <span>All incoming amounts except transfers</span>
        </div>
        <div className="monthly-metric">
          <span className="monthly-metric-label"><ArrowUpRight size={16} aria-hidden="true" /> Spending</span>
          <strong>{s.count ? fmt(s.spending, currency) : '—'}</strong>
          <span>{s.count ? comparison : 'No transactions recorded this month'}</span>
        </div>
        <div className="monthly-metric">
          <span className="monthly-metric-label"><Wallet size={16} aria-hidden="true" /> Net cash flow</span>
          <strong className={s.net < 0 ? 'text-loss' : 'text-gain'}>{s.count ? fmt(s.net, currency) : '—'}</strong>
          <span>{s.net < 0 ? 'Spending exceeds money in' : 'Money in minus spending'}</span>
        </div>
        <div className="monthly-metric">
          <span className="monthly-metric-label"><PiggyBank size={16} aria-hidden="true" /> Savings rate</span>
          <strong>{s.savingsRate === null ? '—' : `${s.savingsRate.toFixed(1)}%`}</strong>
          <span>{s.savingsRate === null ? 'Needs money in to calculate' : 'Share of money in left after spending'}</span>
        </div>
      </div>
    </section>
  )
}
