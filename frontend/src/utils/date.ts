// Today's date as YYYY-MM-DD in the browser's local timezone. Unlike
// `new Date().toISOString().slice(0, 10)`, this doesn't shift to the wrong
// day near midnight for users east or west of UTC.
export function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Parses a 'YYYY-MM-DD' or 'YYYY-MM' string as local midnight. `new
// Date('YYYY-MM-DD')` parses as UTC midnight, which renders as the previous
// day for any user west of UTC once `toLocaleDateString` converts back to
// local time.
export function parseLocalDate(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function formatDateLabel(dateOnly: string, opts: { withYear?: boolean } = {}): string {
  return parseLocalDate(dateOnly).toLocaleDateString('it-IT', {
    day: 'numeric', month: 'short', ...(opts.withYear ? { year: 'numeric' as const } : {}),
  })
}

export function formatMonthLabel(month: string, opts: { withYear?: boolean } = {}): string {
  return parseLocalDate(month + '-01').toLocaleDateString('it-IT', {
    month: 'long', ...(opts.withYear ? { year: 'numeric' as const } : {}),
  })
}
