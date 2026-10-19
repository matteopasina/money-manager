import MoneyChart, { RANGE_XAXIS } from '../../components/MoneyChart'

interface Props {
  nwTrace: Plotly.Data
  currency: string
  ytdPct: number | null
}

export default function NetWorthChartCard({ nwTrace, ytdPct, currency }: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '6px' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Il patrimonio nel tempo</div>
        {ytdPct !== null && (
          <div style={{ fontSize: '12.5px', color: 'var(--ink-faint)' }}>
            {ytdPct >= 0 ? '+' : ''}{ytdPct.toFixed(1)}% da inizio anno
          </div>
        )}
      </div>
      <p className="dashboard-chart-note">{currency} · Ultimi saldi noti nelle date registrate</p>
      <MoneyChart
        data={[nwTrace]}
        layout={{ xaxis: RANGE_XAXIS, yaxis: { tickformat: ',.0f' } }}
        style={{ height: 280 }}
      />
    </div>
  )
}
