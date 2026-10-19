import { TOTAL_BUDGET } from '../api/client'

/** Shared progress color rule: over budget -> loss, >=75% -> accent, else gain. */
export function budgetBarColor(pct: number | null): string {
  if (pct === null || pct > 100) return 'var(--loss)'
  if (pct >= 75) return 'var(--accent)'
  return 'var(--gain)'
}

export function budgetBarWidth(pct: number | null): string {
  return `${Math.min(pct ?? 100, 100)}%`
}

/** Display label for a budget's category (the total budget has a reserved name). */
export function budgetLabel(categoryName: string): string {
  return categoryName === TOTAL_BUDGET ? 'Tutte le spese' : categoryName
}
