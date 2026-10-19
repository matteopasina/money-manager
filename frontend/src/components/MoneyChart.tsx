import createPlotlyComponent from 'react-plotly.js/factory'
import PlotlyBasic from 'plotly.js/dist/plotly-basic.min.js'
import { useEffect, useRef, useState } from 'react'
import { useTheme } from '../useTheme'
// Only the scatter, bar and pie trace families used by this application.
// The CommonJS factory is wrapped once more by Vite in development.
const createPlot = (createPlotlyComponent as unknown as { default?: typeof createPlotlyComponent }).default ?? createPlotlyComponent
const Plot = createPlot(PlotlyBasic)

const FONT_FAMILY = "'Hanken Grotesk', -apple-system, sans-serif"

const LIGHT_LAYOUT = {
  template: 'plotly_white' as const,
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { family: FONT_FAMILY, color: '#716653', size: 10.5 },
  margin: { t: 36, b: 50, l: 52, r: 0 },
  xaxis: {
    gridcolor: '#E7DECC', linecolor: '#E7DECC',
    tickfont: { color: '#716653', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#E7DECC',
  },
  yaxis: {
    gridcolor: '#E7DECC', linecolor: '#E7DECC',
    tickfont: { color: '#716653', size: 10.5, family: FONT_FAMILY },
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
  font: { family: FONT_FAMILY, color: '#B5A68B', size: 10.5 },
  margin: { t: 36, b: 50, l: 52, r: 0 },
  xaxis: {
    gridcolor: '#3A3328', linecolor: '#3A3328',
    tickfont: { color: '#B5A68B', size: 10.5, family: FONT_FAMILY },
    zerolinecolor: '#3A3328',
  },
  yaxis: {
    gridcolor: '#3A3328', linecolor: '#3A3328',
    tickfont: { color: '#B5A68B', size: 10.5, family: FONT_FAMILY },
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
  const { isDark, visualStyle } = useTheme()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  useEffect(() => {
    const element = container.current
    if (!element) return
    // Charts can change size without a window resize, e.g. opening account history.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setWidth(Math.floor(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const standard = isDark ? DARK_LAYOUT : LIGHT_LAYOUT
  const arcadeFont = { family: "'IBM Plex Mono', monospace", color: isDark ? '#ADBF9F' : '#50634C', size: 11 }
  const gridcolor = isDark ? '#456348' : '#AFBCA0'
  const base = visualStyle === 'arcade' ? {
    ...standard,
    font: arcadeFont,
    xaxis: { ...standard.xaxis, gridcolor, linecolor: gridcolor, zerolinecolor: gridcolor, tickfont: arcadeFont },
    yaxis: { ...standard.yaxis, gridcolor, linecolor: gridcolor, zerolinecolor: gridcolor, tickfont: arcadeFont },
    legend: { ...standard.legend, font: arcadeFont, bgcolor: isDark ? '#1A3831' : '#F4F5E8', bordercolor: gridcolor },
  } : standard
  const merged = {
    ...base,
    ...layout,
    width: layout.width ?? width,
    xaxis: { ...base.xaxis, ...(layout.xaxis as object || {}) },
    yaxis: { ...base.yaxis, ...(layout.yaxis as object || {}) },
    legend: { ...base.legend, ...(layout.legend as object || {}) },
  }

  return (
    <div ref={container} style={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
    <Plot
      data={data}
      layout={merged as Partial<Plotly.Layout>}
      style={{ width: '100%', minWidth: 0, ...style }}
      config={{ displayModeBar: false, responsive: true, ...config }}
      useResizeHandler
    />
    </div>
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
  rangeselector: { buttons: RANGE_BUTTONS },
  rangeslider: { visible: false } as Plotly.Layout['xaxis']['rangeslider'],
}

