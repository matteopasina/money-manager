import { useMemo } from 'react'
import { api } from '../api/client'
import { useApi } from './useApi'
import { todayLocal } from '../utils/date'
import { computeMetrics, computeNetWorthSeries } from '../pages/dashboard/data'

/** Portfolio screens depend only on balances and currency, not transaction availability. */
export default function usePortfolioData() {
  const today = todayLocal()
  const request = useApi(() => Promise.all([api.balances.list(), api.settings.all()]), [])
  const balances = useMemo(() => (request.data?.[0] ?? []).filter(row => row.date <= today), [request.data, today])
  const metrics = useMemo(() => computeMetrics(balances, today), [balances, today])
  const series = useMemo(() => computeNetWorthSeries(balances, today), [balances, today])
  return { balances, metrics, series, today, currency: request.data?.[1].base_currency ?? 'EUR', loading: request.loading, error: request.error, reload: request.reload }
}
