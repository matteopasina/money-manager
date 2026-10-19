import { Link } from 'react-router-dom'
import LoadingSpinner from '../../components/LoadingSpinner'
import Alert from '../../components/Alert'
import usePortfolioData from '../../hooks/usePortfolioData'
import PortfolioCard from '../home/PortfolioCard'
import AllocationCard from '../dashboard/AllocationCard'
import NetWorthChartCard from '../dashboard/NetWorthChartCard'
import AccountsOverTime from '../dashboard/AccountsOverTime'
import { buildAccountTraces, computeYtdPct } from '../dashboard/data'
import { ACCOUNT_PALETTE } from '../../utils/chartPalette'

export default function WealthOverview() {
  const model = usePortfolioData()
  if (model.loading) return <LoadingSpinner />
  if (model.error) return <Alert type="error">Impossibile caricare il patrimonio. <button className="btn-link" onClick={model.reload}>Riprova</button></Alert>
  const trace = { x: model.series.x, y: model.series.y, type: 'scatter' as const, mode: 'lines+markers' as const, name: 'Patrimonio', line: { color: ACCOUNT_PALETTE[0], width: 2.5 } }
  return <div className="dashboard workspace-stack">
    <div className="dashboard-actions"><Link className="btn btn-secondary" to="/import?type=balances">Importa saldi</Link><Link className="btn btn-primary" to="/wealth/accounts">Gestisci conti e saldi →</Link></div>
    <PortfolioCard metrics={model.metrics} series={model.series} currency={model.currency} />
    <div className="dashboard-grid"><NetWorthChartCard nwTrace={trace} ytdPct={computeYtdPct(model.series, model.today)} currency={model.currency} /><AllocationCard metrics={model.metrics} currency={model.currency} /></div>
    <details className="dashboard-account-details"><summary>Esplora lo storico dei singoli conti</summary><AccountsOverTime accountTraces={buildAccountTraces(model.balances)} /></details>
  </div>
}
