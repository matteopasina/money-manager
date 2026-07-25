export function fmt(n: number, currency = 'EUR', opts: { decimals?: number } = {}) {
  const decimals = opts.decimals ?? 0
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  }).format(n)
}

// Plain numeric amount — 2 decimal places, locale thousands separator, no currency symbol.
export function fmtAmount(n: number) {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
