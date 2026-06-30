import PlotlyImport from 'react-plotly.js'
// react-plotly.js is CJS; Vite's interop may wrap it — unwrap if needed
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = ((PlotlyImport as any).default ?? PlotlyImport) as typeof PlotlyImport

const FONT_FAMILY = "'Hanken Grotesk', -apple-system, sans-serif"

const LIGHT_LAYOUT = {
  template: 'plotly_white' as const,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { family: FONT_FAMILY, color: '#A89D88', size: 10.5 },
  margin: { t: 36, b: 50, l: 0, r: 0 },
  xaxis: {
    gridcolor: '#E7DECC', linecolor: '#E7DECC',
    tickfont: { color: '#A89D88', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#E7DECC',
  },
  yaxis: {
    gridcolor: '#E7DECC', linecolor: '#E7DECC',
    tickfont: { color: '#A89D88', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#E7DECC',
  },
  legend: {
    bgcolor: 'rgba(246,241,231,0.9)', bordercolor: '#E2D8C5', borderwidth: 1,
    orientation: 'h' as const, yanchor: 'top' as const, y: -0.2,
    xanchor: 'left' as const, x: 0,
    font: { color: '#544B3D', size: 11, family: FONT_FAMILY },
  },
}

const DARK_LAYOUT = {
  template: 'plotly_dark' as const,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { family: FONT_FAMILY, color: '#8C8068', size: 10.5 },
  margin: { t: 36, b: 50, l: 0, r: 0 },
  xaxis: {
    gridcolor: '#3A3328', linecolor: '#3A3328',
    tickfont: { color: '#8C8068', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#3A3328',
  },
  yaxis: {
    gridcolor: '#3A3328', linecolor: '#3A3328',
    tickfont: { color: '#8C8068', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#3A3328',
  },
  legend: {
    bgcolor: 'rgba(36,32,25,0.9)', bordercolor: '#3A3328', borderwidth: 1,
    orientation: 'h' as const, yanchor: 'top' as const, y: -0.2,
    xanchor: 'left' as const, x: 0,
    font: { color: '#D9CFBC', size: 11, family: FONT_FAMILY },
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

// Warm tonal "Meridian" categorical palette — gold, forest, umber, tan, clay, repeating.
// eslint-disable-next-line react-refresh/only-export-components
export const ACCOUNT_PALETTE = [
  '#B8842B', '#3F7A55', '#6E5A3E', '#A88B5C', '#C97B4A',
  '#8C9A6B', '#9A6B4A', '#7A8C6B', '#B0915C', '#5C7A6E',
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
