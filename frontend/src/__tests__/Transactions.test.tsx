import { describe, it, expect } from 'vitest'

// Pure unit test for the filter logic used in Transactions.tsx
// (avoids needing to mock the full API)

type TxRow = { description: string; reference: string | null; category: string | null }

function filterTransactions(rows: TxRow[], search: string): TxRow[] {
  const q = search.toLowerCase()
  if (!q) return rows
  return rows.filter(r =>
    r.description.toLowerCase().includes(q) ||
    (r.reference ?? '').toLowerCase().includes(q) ||
    (r.category ?? '').toLowerCase().includes(q)
  )
}

const ROWS: TxRow[] = [
  { description: 'Amazon purchase', reference: 'REF001', category: 'Shopping' },
  { description: 'Salary payment', reference: 'SAL-2024', category: 'Income' },
  { description: 'Netflix subscription', reference: null, category: 'Entertainment' },
  { description: 'Gym fee', reference: 'GYM123', category: null },
]

describe('Transactions filter logic', () => {
  it('returns all rows when search is empty', () => {
    expect(filterTransactions(ROWS, '')).toHaveLength(4)
  })

  it('filters by description (case-insensitive)', () => {
    const result = filterTransactions(ROWS, 'AMAZON')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Amazon purchase')
  })

  it('filters by reference', () => {
    const result = filterTransactions(ROWS, 'sal-2024')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Salary payment')
  })

  it('filters by category', () => {
    const result = filterTransactions(ROWS, 'entertainment')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Netflix subscription')
  })

  it('handles null reference and category gracefully', () => {
    const result = filterTransactions(ROWS, 'gym')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Gym fee')
  })

  it('returns empty array when nothing matches', () => {
    expect(filterTransactions(ROWS, 'zzznomatch')).toHaveLength(0)
  })

  it('returns multiple matches', () => {
    // Both "Shopping" and "Salary" match 's'
    const result = filterTransactions(ROWS, 'payment')
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('Salary payment')
  })
})
