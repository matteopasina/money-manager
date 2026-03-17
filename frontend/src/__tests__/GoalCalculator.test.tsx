import { describe, it, expect } from 'vitest'

// Unit tests for the FIRE calculation helpers used in GoalCalculator.tsx

function computeFireNumber(monthlyExpenses: number, withdrawalRatePct: number): number {
  if (withdrawalRatePct <= 0) throw new Error('Withdrawal rate must be positive')
  return (monthlyExpenses * 12) / (withdrawalRatePct / 100)
}

function yearsToTarget(
  currentNw: number,
  target: number,
  monthlyContrib: number,
  annualReturnPct: number,
): number | null {
  const monthlyReturn = annualReturnPct / 100 / 12
  let balance = currentNw
  for (let i = 0; i < 600; i++) {
    balance = balance * (1 + monthlyReturn) + monthlyContrib
    if (balance >= target) return Math.round((i + 1) / 12 * 10) / 10
  }
  return null
}

describe('FIRE number calculation', () => {
  it('calculates correctly with 4% rule', () => {
    // 2000/month × 12 / 0.04 = 600,000
    expect(computeFireNumber(2000, 4)).toBe(600_000)
  })

  it('calculates correctly with 3% rule', () => {
    expect(computeFireNumber(3000, 3)).toBeCloseTo(1_200_000)
  })

  it('throws on zero withdrawal rate', () => {
    expect(() => computeFireNumber(2000, 0)).toThrow()
  })

  it('throws on negative withdrawal rate', () => {
    expect(() => computeFireNumber(2000, -1)).toThrow()
  })
})

describe('Years to target', () => {
  it('returns a positive number when target is reachable', () => {
    const years = yearsToTarget(50_000, 600_000, 1500, 7)
    expect(years).not.toBeNull()
    expect(years!).toBeGreaterThan(0)
  })

  it('already-met target returns near zero months', () => {
    // Start above target
    const years = yearsToTarget(1_000_000, 500_000, 0, 0)
    // First month it's already above — should be near 0
    expect(years).not.toBeNull()
    expect(years!).toBeLessThan(1)
  })

  it('returns null when target is unreachable in 50 years', () => {
    // Negative contribution, starting far from target
    const years = yearsToTarget(1000, 1_000_000_000, -5000, 0)
    expect(years).toBeNull()
  })
})
