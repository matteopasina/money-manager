import { useMemo } from 'react'
import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'
import { todayLocal } from '../../utils/date'
import { computeMetrics, computeNetWorthSeries, computeMonthSummary } from '../dashboard/data'
import { expectedMonthCashFlow } from '../../utils/cashFlow'

/** Data boundary only. Cards receive values and never fetch or mutate finances. */
export default function useHomeData(selectedMonth?: string) {
  const today = todayLocal()
  const currentMonth = today.slice(0, 7)
  const month = selectedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth) && selectedMonth <= currentMonth ? selectedMonth : currentMonth
  const core = useApi(() => Promise.all([
    api.balances.list(), api.transactions.list(), api.categories.list(), api.settings.all(),
  ]), [])
  const model = useMemo(() => {
    const balances = (core.data?.[0] ?? []).filter(r => r.date <= today)
    const transactions = core.data?.[1] ?? []
    const categories = core.data?.[2] ?? []
    return {
      balances, transactions, categories, currency: core.data?.[3].base_currency ?? 'EUR',
      metrics: computeMetrics(balances, today), series: computeNetWorthSeries(balances, today),
      summary: computeMonthSummary(transactions, categories, month, today),
      uncategorizedCount: transactions.filter(t => !t.category && t.date <= today && t.date.slice(0, 7) === month).length,
      forecast: month === currentMonth ? expectedMonthCashFlow(transactions, categories, today) : null,
      months: [...new Set([currentMonth, month, ...transactions.filter(t => t.date <= today).map(t => t.date.slice(0, 7))])].sort().reverse(),
      recent: transactions.filter(t => t.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 4),
    }
  }, [core.data, today, currentMonth, month])
  return { ...model, today, currentMonth, month, loading: core.loading, error: core.error, reload: core.reload }
}
