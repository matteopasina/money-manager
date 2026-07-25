import MoneyChart from '../../components/MoneyChart'

interface Props {
  nwTrace: Plotly.Data
  ytdPct: number | null
}

export default function NetWorthChartCard({ nwTrace, ytdPct }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Net worth over time</div>
        {ytdPct !== null && (
          <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
            {ytdPct >= 0 ? '+' : ''}{ytdPct.toFixed(1)}% this year
          </div>
        )}
      </div>
      <MoneyChart
        data={[nwTrace]}
        layout={{ yaxis: { tickformat: ',.0f' } }}
        style={{ height: 280 }}
      />
    </div>
  )
}
