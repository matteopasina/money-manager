import MoneyChart from '../../components/MoneyChart'

interface Props {
  accountTraces: Plotly.Data[]
}

export default function AccountsOverTime({ accountTraces }: Props) {
  return (
    <div className="card" style={{ marginBottom: '18px' }}>
      <div className="section-title">I conti nel tempo</div>
      <MoneyChart
        data={accountTraces}
        layout={{ yaxis: { tickformat: ',.0f' }, showlegend: true }}
        style={{ height: 280 }}
      />
    </div>
  )
}
