import { useMemo } from 'react'
import MoneyChart from '../../components/MoneyChart'
import { monthlyNetCashFlow, expectedMonthCashFlow } from '../../utils/cashFlow'
import { fmt } from '../../utils/money'
import { formatMonthLabel } from '../../utils/date'
import type { Category, TransactionRow } from '../../api/client'

interface Props {
  transactions: TransactionRow[]
  categories: Category[]
  currency: string
  month: string
  asOf: string
}

export default function NetCashFlowChartCard({ transactions, categories, currency, month, asOf }: Props) {
  const points = useMemo(() => monthlyNetCashFlow(transactions, categories, asOf, month), [transactions, categories, asOf, month])
  const forecast = useMemo(() => month === asOf.slice(0, 7) ? expectedMonthCashFlow(transactions, categories, asOf) : null, [transactions, categories, asOf, month])
  return <section className="card" aria-labelledby="net-cash-flow-heading">
    <div className="dashboard-section-header">
      <div>
        <h2 id="net-cash-flow-heading">Net cash flow</h2>
        <p>Monthly income minus spending · {currency} · Up to 12 months ending {formatMonthLabel(month, { withYear: true })}</p>
      </div>
    </div>
    {forecast && <p>Current: <strong>{fmt(forecast.actual, currency)}</strong> · Expected month-end: <strong>{fmt(forecast.expected, currency)}</strong></p>}
    {points.length ? <MoneyChart data={[{
      type: 'bar', name: 'Recorded',
      x: points.map(p => `${p.month}-01`), y: points.map(p => p.net),
      marker: { color: points.map(p => p.net >= 0 ? '#3F7A55' : '#B65A42') },
      customdata: points.map(p => [p.income, p.spending]),
      hovertemplate: `%{x|%b %Y}<br>Net: %{y:,.2f} ${currency}<br>Income: %{customdata[0]:,.2f} ${currency}<br>Spending: %{customdata[1]:,.2f} ${currency}<extra></extra>`,
    }, ...(forecast ? [{
      type: 'bar' as const, name: 'Expected month-end',
      x: [`${month}-01`], y: [forecast.expected],
      marker: { color: '#B8842B', pattern: { shape: '/' as const } },
      hovertemplate: `%{x|%b %Y}<br>Expected: %{y:,.2f} ${currency}<extra>Estimate</extra>`,
    }] : [])]} layout={{
      margin: { t: 12, b: forecast ? 80 : 42, l: 65, r: 12 },
      xaxis: { type: 'date', tickformat: '%b\n%Y', dtick: 'M1' },
      yaxis: { tickformat: ',.0f', zeroline: true, zerolinewidth: 2, rangemode: 'tozero' },
      bargap: 0.35,
      barmode: 'group', showlegend: !!forecast,
      legend: { y: -0.22 },
    }} style={{ height: forecast ? 350 : 300 }} /> : <p className="dashboard-empty">No transactions recorded for this period.</p>}
    {forecast && <details><summary>How the month-end estimate is calculated</summary><p className="dashboard-chart-note">
      Recorded net cash flow {fmt(forecast.actual, currency)} + outstanding salary {fmt(forecast.expectedSalary, currency)} − remaining spending {fmt(forecast.remainingSpending, currency)}.
      {' '}{forecast.salaryReceived ? 'Salary already received; no second salary added.' : `Salary expected on the 27th; median of ${forecast.salarySamples} recent completed months.`}
      {' '}Remaining spending uses the median spending after day {Number(asOf.slice(8, 10))} in {forecast.spendingSamples} recent completed months. Other future income is excluded. This is an estimate, not a recorded balance.
    </p></details>}
    {month === asOf.slice(0, 7) && !forecast && <p className="dashboard-chart-note">Month-end estimate needs at least two recent months of recorded activity and identifiable salary payments.</p>}
    <p className="dashboard-chart-note">Green: surplus · Red: deficit. Transfers and investment trades excluded. Months without recorded activity show zero; the current month is incomplete.</p>
  </section>
}
