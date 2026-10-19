import type { Category, TransactionRow } from '../api/client'

export type CashFlowKind = 'income' | 'spending' | 'transfer' | 'trade'
export const baseAmount = (row: TransactionRow) => row.amount_base ?? row.amount

/** Signs determine incoming/outgoing cash. Income labels never hide a debit. */
export function cashFlowKind(row: TransactionRow, transfers: Set<string>): CashFlowKind {
  if (row.category === 'Trade') return 'trade'
  if (transfers.has(row.category ?? '')) return 'transfer'
  return baseAmount(row) > 0 ? 'income' : 'spending'
}

export function summarizeCashFlow(rows: TransactionRow[], categories: Category[], asOf: string) {
  const transfers = new Set(categories.filter(c => c.is_transfer).map(c => c.name))
  const months = new Map<string, { income: number; spend: number; transfersOut: number }>()
  let income = 0, spending = 0, transfersOut = 0, investmentFunding = 0, futureCount = 0
  for (const row of rows) {
    if (row.date > asOf) { futureCount++; continue }
    const kind = cashFlowKind(row, transfers)
    if (kind === 'trade') continue
    const month = row.date.slice(0, 7)
    if (!months.has(month)) months.set(month, { income: 0, spend: 0, transfersOut: 0 })
    const totals = months.get(month)!
    const amount = baseAmount(row)
    if (kind === 'income') { income += amount; totals.income += amount }
    else if (kind === 'spending') { spending -= amount; totals.spend -= amount }
    else if (amount < 0) {
      transfersOut -= amount
      totals.transfersOut -= amount
      if (row.category === 'Investment') investmentFunding -= amount
    }
  }
  return { income, spending, transfersOut, investmentFunding, futureCount, months }
}

/** Calendar months up to the selected month, with gaps visible as zero activity. */
export function monthlyNetCashFlow(rows: TransactionRow[], categories: Category[], asOf: string, endMonth: string) {
  const { months } = summarizeCashFlow(rows, categories, asOf)
  const end = endMonth < asOf.slice(0, 7) ? endMonth : asOf.slice(0, 7)
  const first = [...months.keys()].filter(month => month <= end).sort()[0]
  if (!first) return []
  const [year, month] = end.split('-').map(Number)
  const endIndex = year * 12 + month - 1
  const [firstYear, firstMonth] = first.split('-').map(Number)
  const startIndex = Math.max(firstYear * 12 + firstMonth - 1, endIndex - 11)
  return Array.from({ length: endIndex - startIndex + 1 }, (_, i) => {
    const index = startIndex + i
    const key = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`
    const totals = months.get(key)
    return { month: key, income: totals?.income ?? 0, spending: totals?.spend ?? 0,
      net: (totals?.income ?? 0) - (totals?.spend ?? 0) }
  })
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

/** End-of-month estimate: actual cash + outstanding payroll - comparable remaining spending. */
export function expectedMonthCashFlow(rows: TransactionRow[], categories: Category[], asOf: string) {
  const month = asOf.slice(0, 7)
  const day = Number(asOf.slice(8, 10))
  const transfers = new Set(categories.filter(c => c.is_transfer).map(c => c.name))
  const relevant = rows.filter(row => row.date <= asOf && !['transfer', 'trade'].includes(cashFlowKind(row, transfers)))
  const payroll = (row: TransactionRow) => baseAmount(row) > 0 && /stipendio|salary|payroll|n[oó]mina/i.test(`${row.description} ${row.reference ?? ''}`)
  const [year, number] = month.split('-').map(Number)
  const index = year * 12 + number - 1
  const history = Array.from({ length: 3 }, (_, i) => {
    const previous = index - i - 1
    const key = `${Math.floor(previous / 12)}-${String(previous % 12 + 1).padStart(2, '0')}`
    return relevant.filter(row => row.date.slice(0, 7) === key)
  }).filter(monthRows => monthRows.length > 0)
  const salaries = history.map(monthRows => monthRows.filter(payroll).reduce((sum, row) => sum + baseAmount(row), 0)).filter(value => value > 0)
  if (history.length < 2 || salaries.length < 2) return null
  const current = relevant.filter(row => row.date.slice(0, 7) === month)
  const actual = current.reduce((sum, row) => sum + baseAmount(row), 0)
  const salaryReceived = current.some(payroll)
  const expectedSalary = salaryReceived ? 0 : median(salaries)
  const lastDay = new Date(year, number, 0).getDate()
  const remainingSpending = day === lastDay ? 0 : median(history.map(monthRows => monthRows.reduce((sum, row) =>
    sum + (Number(row.date.slice(8, 10)) > day ? Math.max(0, -baseAmount(row)) : 0), 0)))
  return { actual, expected: actual + expectedSalary - remainingSpending, expectedSalary, remainingSpending,
    salaryReceived, salarySamples: salaries.length, spendingSamples: history.length, payday: 27 }
}
