import PlotlyImport from 'react-plotly.js'
// react-plotly.js is CJS; Vite's interop may wrap it — unwrap if needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = ((PlotlyImport as any).default ?? PlotlyImport) as typeof PlotlyImport

const LIGHT_LAYOUT = {
  template: 'plotly_white' as const,
  paper_bgcolor: '#ffffff',
  plot_bgcolor:  '#ffffff',
  font: { family: 'Inter, -apple-system, sans-serif', color: '#334155', size: 12 },
  margin: { t: 30, b: 50, l: 0, r: 0 },
  xaxis: {
    gridcolor: '#f1f5f9', linecolor: '#e2e8f0',
    tickfont: { color: '#64748b', size: 11 },
    zerolinecolor: '#e2e8f0',
  },
  yaxis: {
    gridcolor: '#f1f5f9', linecolor: '#e2e8f0',
    tickfont: { color: '#64748b', size: 11 },
    zerolinecolor: '#e2e8f0',
  },
  legend: {
    bgcolor: 'rgba(255,255,255,0.9)', bordercolor: '#e2e8f0', borderwidth: 1,
    orientation: 'h' as const, yanchor: 'top' as const, y: -0.2,
    xanchor: 'left' as const, x: 0,
    font: { color: '#334155', size: 11 },
  },
}

const DARK_LAYOUT = {
  template: 'plotly_dark' as const,
  paper_bgcolor: '#1e293b',
  plot_bgcolor:  '#1e293b',
  font: { family: 'Inter, -apple-system, sans-serif', color: '#cbd5e1', size: 12 },
  margin: { t: 30, b: 50, l: 0, r: 0 },
  xaxis: {
    gridcolor: '#334155', linecolor: '#334155',
    tickfont: { color: '#64748b', size: 11 },
    zerolinecolor: '#334155',
  },
  yaxis: {
    gridcolor: '#334155', linecolor: '#334155',
    tickfont: { color: '#64748b', size: 11 },
    zerolinecolor: '#334155',
  },
  legend: {
    bgcolor: 'rgba(30,41,59,0.9)', bordercolor: '#334155', borderwidth: 1,
    orientation: 'h' as const, yanchor: 'top' as const, y: -0.2,
    xanchor: 'left' as const, x: 0,
    font: { color: '#cbd5e1', size: 11 },
  },
}

interface Props {
  data: Plotly.Data[]
  layout?: Partial<Plotly.Layout>
  style?: React.CSSProperties
  config?: Partial<Plotly.Config>
}

export default function MoneyChart({ data, layout = {}, style, config }: Props) {
  const base = document.documentElement.dataset.theme === 'dark' ? DARK_LAYOUT : LIGHT_LAYOUT
  const merged = {
    ...base,
    ...layout,
    xaxis: { ...base.xaxis, ...(layout.xaxis as object || {}) },
    yaxis: { ...base.yaxis, ...(layout.yaxis as object || {}) },
    legend: { ...base.legend, ...(layout.legend as object || {}) },
  }

  return (
    <Plot
      data={data}
      layout={merged as Partial<Plotly.Layout>}
      style={{ width: '100%', ...style }}
      config={{ displayModeBar: false, responsive: true, ...config }}
      useResizeHandler
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const RANGE_BUTTONS = [
  { count: 3,  label: '3M',  step: 'month' as const, stepmode: 'backward' as const },
  { count: 6,  label: '6M',  step: 'month' as const, stepmode: 'backward' as const },
  { count: 1,  label: '1Y',  step: 'year'  as const, stepmode: 'backward' as const },
  { count: 3,  label: '3Y',  step: 'year'  as const, stepmode: 'backward' as const },
  { step: 'all' as const, label: 'All' },
]

// eslint-disable-next-line react-refresh/only-export-components
export const RANGE_XAXIS: Partial<Plotly.Layout['xaxis']> = {
  // Cast is required: plotly.js typedefs don't expose rangeselector/rangeslider
  // on LayoutAxis in all versions — keep the cast here so callers don't need it.
  rangeselector: RANGE_BUTTONS as unknown as Plotly.Layout['xaxis']['rangeselector'],
  rangeslider: { visible: false } as Plotly.Layout['xaxis']['rangeslider'],
}

// eslint-disable-next-line react-refresh/only-export-components
export const ACCOUNT_PALETTE = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6',
  '#06b6d4','#f97316','#ec4899','#14b8a6','#eab308',
]

// eslint-disable-next-line react-refresh/only-export-components
export function fmt(n: number, currency = 'EUR') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n)
}

// Plain numeric amount — 2 decimal places, locale thousands separator, no currency symbol.
// eslint-disable-next-line react-refresh/only-export-components
export function fmtAmount(n: number) {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
