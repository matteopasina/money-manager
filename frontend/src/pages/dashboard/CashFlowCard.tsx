import CashFlowSankey from '../../components/CashFlowSankey'
import { formatMonthLabel } from '../../utils/date'
import type { SankeyData } from './data'

interface Props {
  sankey: SankeyData
}

export default function CashFlowCard({ sankey }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <div className="section-title" style={{ marginBottom: 0 }}>
          {sankey.isCurrentMonth
            ? 'Cash flow this month'
            : `Cash flow — ${formatMonthLabel(sankey.month, { withYear: true })}`}
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: '11.5px', color: 'var(--ink-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#3F7A55' }} />Income</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#6E5A3E' }} />Spending</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 3, background: '#4A5C8A' }} />Left over</span>
        </div>
      </div>
      <CashFlowSankey
        sources={sankey.sources}
        targets={sankey.targets}
        hubAmount={'€' + Math.round(sankey.income).toLocaleString('en-US')}
      />
      <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 8 }}>{sankey.caption}</div>
    </div>
  )
}
