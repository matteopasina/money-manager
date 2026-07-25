import MoneyChart from '../../components/MoneyChart'
import type { Metrics } from './data'

interface Props {
  metrics: Metrics
  allocTrace: Plotly.Data[]
  inkColor: string
}

export default function AllocationCard({ metrics, allocTrace, inkColor }: Props) {
  return (
    <div className="card">
      <div className="section-title" style={{ marginBottom: 10 }}>Allocation</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <div style={{ position: 'relative', width: 150, height: 150, flexShrink: 0 }}>
          <MoneyChart
            data={allocTrace}
            layout={{ showlegend: false, margin: { t: 0, b: 0, l: 0, r: 0 } }}
            style={{ height: 150 }}
          />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: inkColor, fontVariantNumeric: 'tabular-nums' }}>
              €{Math.round(metrics.totalNow / 1000)}k
            </div>
            <div style={{ fontSize: 9, letterSpacing: '1.4px', color: 'var(--ink-faint)' }}>NET WORTH</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0 }}>
          {metrics.byType.map(g => (
            <div key={g.type} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: g.color, flexShrink: 0 }} />
              <span style={{ color: 'var(--ink-soft)', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.type}</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>€{Math.round(g.now / 1000)}k</span>
              <span style={{ color: 'var(--ink-ghost)', fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'right' }}>
                {((g.now / metrics.totalNow) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
