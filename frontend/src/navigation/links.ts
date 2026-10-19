/** Share the same period between a summary and its transaction drill-down. */
export function transactionPeriodLink(month: string, asOf: string, uncategorized = false) {
  const [year, number] = month.split('-').map(Number)
  const end = month === asOf.slice(0, 7) ? asOf : `${month}-${new Date(year, number, 0).getDate()}`
  const query = new URLSearchParams()
  if (uncategorized) query.set('uncategorized', '1')
  query.set('start', `${month}-01`)
  query.set('end', end)
  return `/transactions?${query}`
}
