import type { MonthSummary } from '../dashboard/data'

export interface FlowCategory { name: string; amount: number; color: string; grouped?: boolean }

/** Small categories remain represented in a conserved, explicitly named remainder. */
export function flowCategories(summary: MonthSummary): FlowCategory[] {
  const categories = summary.categories.filter(c => c.amount > 0)
  if (categories.length <= 4) return categories
  return [...categories.slice(0, 3), {
    name: 'Altre spese', amount: categories.slice(3).reduce((sum, c) => sum + c.amount, 0),
    color: 'var(--ink-muted)', grouped: true,
  }]
}

export function flowRibbon(x1: number, y1: number, x2: number, y2: number, height: number) {
  const bend = (x2 - x1) * 0.48
  return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2} L${x2},${y2 + height} C${x2 - bend},${y2 + height} ${x1 + bend},${y1 + height} ${x1},${y1 + height} Z`
}

/** A single proportional scale is shared by sources, hub and category branches. */
export function moneyFlowLayout(summary: MonthSummary) {
  const total = Math.max(summary.income, summary.spending)
  const scale = total > 0 ? 96 / total : 0
  const funded = Math.min(summary.income, summary.spending) * scale
  const deficit = Math.max(0, -summary.net) * scale
  const surplus = Math.max(0, summary.net) * scale
  const categories = flowCategories(summary)
  const incomeY = 105 - summary.income * scale / 2
  const deficitY = 280 - deficit / 2
  const expenseY = 164 - summary.spending * scale / 2
  let destinationY = 52
  let hubY = expenseY
  const branches = categories.map(category => {
    const height = category.amount * scale
    const branch = { ...category, height, sourceY: hubY, targetY: destinationY }
    hubY += height
    destinationY += height + 34
    return branch
  })
  return { scale, funded, deficit, surplus, incomeY, deficitY, expenseY, branches, surplusY: Math.max(290, destinationY + 12) }
}
