import { transactionPeriodLink } from '../../navigation/links'
import { Link } from 'react-router-dom'
import type { MonthSummary } from '../dashboard/data'
import type { expectedMonthCashFlow } from '../../utils/cashFlow'
import type { BudgetRow } from '../../api/client'
import { fmt } from '../../utils/money'
import { formatMonthLabel } from '../../utils/date'
import { budgetBarColor, budgetBarWidth } from '../../utils/budgetDisplay'

export default function MonthCard({ summary: s, forecast, months, current, currency, budget, onMonthChange, asOf }: {
  asOf: string; summary: MonthSummary; forecast: ReturnType<typeof expectedMonthCashFlow>; months: string[]; current: boolean
  currency: string; budget: BudgetRow | null; onMonthChange: (month: string) => void
}) {
  return <section className="home-panel month-panel" aria-labelledby="month-title">
    <div className="panel-heading"><h2 id="month-title">Il tuo mese</h2><label className="sr-only" htmlFor="home-month">Mese</label><select id="home-month" value={s.month} onChange={e => onMonthChange(e.target.value)}>{months.map(m => <option value={m} key={m}>{formatMonthLabel(m, { withYear: true })}</option>)}</select></div>
    <p className="eyebrow">{forecast ? 'Saldo previsto a fine mese' : current ? 'Saldo del mese, ad oggi' : 'Saldo del mese registrato'}</p>
    <div className={`month-total ${(forecast?.expected ?? s.net) < 0 ? 'text-loss' : (forecast?.expected ?? s.net) > 0 ? 'text-gain' : ''}`}>{forecast || s.count ? `${(forecast?.expected ?? s.net) > 0 ? '+' : ''}${fmt(forecast?.expected ?? s.net, currency)}` : '—'}</div>
    {forecast ? <><div className="month-trajectory"><span>Oggi<strong>{fmt(forecast.actual, currency)}</strong></span><span aria-hidden="true">······→</span><span>Fine mese<strong className={forecast.expected > 0 ? 'text-gain' : forecast.expected < 0 ? 'text-loss' : undefined}>{fmt(forecast.expected, currency)}</strong></span></div><details className="month-method"><summary>Come viene stimato</summary><p>Saldo registrato + stipendio ancora atteso ({fmt(forecast.expectedSalary, currency)}) − spese residue stimate ({fmt(forecast.remainingSpending, currency)}). Mediane di {forecast.spendingSamples} mesi recenti. Trasferimenti e compravendite esclusi. Altre entrate future escluse. È una stima, non un saldo disponibile.</p></details></> : <p className="home-caption">{current ? 'La previsione richiede almeno due mesi recenti con stipendio riconoscibile.' : 'Dati consuntivi; la completezza dipende dai movimenti importati.'}</p>}
    <dl className="month-ledger"><div><dt>Entrate</dt><dd>{s.count ? fmt(s.income, currency) : '—'}</dd></div><div><dt>Spese</dt><dd>{s.count ? fmt(s.spending, currency) : '—'}</dd></div></dl>
    {budget && <div className="month-budget"><div><span>Budget complessivo</span><strong>{fmt(budget.spent, currency)} / {fmt(budget.effective, currency)}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: budgetBarWidth(budget.pct), background: budgetBarColor(budget.pct) }} /></div><p>{budget.remaining < 0 ? `${fmt(-budget.remaining, currency)} oltre il limite` : `${fmt(budget.remaining, currency)} nel budget`}</p></div>}
    <Link className="home-text-link" to={transactionPeriodLink(s.month, asOf)}>Esplora i movimenti →</Link>
  </section>
}
