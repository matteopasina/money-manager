import { useNavigate } from 'react-router-dom'
import { TOTAL_BUDGET, type BudgetsStatus, type BudgetRow } from '../../api/client'
import { fmt } from '../../utils/money'
import { budgetBarColor, budgetBarWidth } from '../../utils/budgetDisplay'

interface Props {
  budgets: BudgetsStatus
  totalBudget: BudgetRow | null
  widgetRows: BudgetRow[]
}

export default function BudgetsWidget({ budgets, totalBudget, widgetRows }: Props) {
  const navigate = useNavigate()

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Budgets</div>
        <button className="btn-link" onClick={() => navigate('/budgets')}>Manage →</button>
      </div>
      {totalBudget && (
        <div style={{ marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border-soft)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--ink)' }}>All spending</span>
            <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {fmt(totalBudget.spent, budgets.currency)} / {fmt(totalBudget.effective, budgets.currency)}
            </span>
          </div>
          <div className="progress-track" style={{ height: 7 }}>
            <div className="progress-fill" style={{ width: budgetBarWidth(totalBudget.pct), background: budgetBarColor(totalBudget.pct) }} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {widgetRows.map(b => (
          <div key={b.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.category_name}
              </span>
              <span style={{ fontSize: '11.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {fmt(b.spent, budgets.currency)} / {fmt(b.effective, budgets.currency)}
              </span>
            </div>
            <div className="progress-track" style={{ height: 6 }}>
              <div className="progress-fill" style={{ width: budgetBarWidth(b.pct), background: budgetBarColor(b.pct) }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 12 }}>
        {(() => {
          const activeCount = budgets.budgets.filter(b => b.active && b.category_name !== TOTAL_BUDGET).length
          // budgets.totals excludes the "All spending" cap — fall back to it
          // when it's the only active budget, same as the Budgets page.
          const remaining = activeCount === 0 && totalBudget ? totalBudget.remaining : budgets.totals.remaining
          const label = `budget${activeCount === 1 ? '' : 's'}`
          return remaining >= 0
            ? `${fmt(remaining, budgets.currency)} left across ${activeCount || 1} ${label} this month`
            : `${fmt(Math.abs(remaining), budgets.currency)} over across ${activeCount || 1} ${label} this month`
        })()}
      </div>
    </div>
  )
}
