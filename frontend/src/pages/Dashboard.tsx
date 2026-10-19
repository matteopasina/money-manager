import { type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { formatDateLabel, parseLocalDate } from '../utils/date'
import RecentTransactions from './dashboard/RecentTransactions'
import useHomeData from './home/useHomeData'
import useHomeExtras from './home/useHomeExtras'
import { homeSections, type HomeSectionId } from './home/layout'
import PortfolioCard from './home/PortfolioCard'
import MonthCard from './home/MonthCard'
import FlowCard from './home/FlowCard'
import AttentionCard from './home/AttentionCard'
import AskCard from './home/AskCard'

export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const model = useHomeData(searchParams.get('month') ?? undefined)
  function setMonth(month: string) { setSearchParams(previous => { const next = new URLSearchParams(previous); next.set('month', month); return next }) }
  const extras = useHomeExtras()
  if (model.loading) return <LoadingSpinner />
  if (model.error) return <div><h1>Il tuo quadro</h1><Alert type="error">Impossibile caricare il quadro: {model.error}</Alert><button className="btn btn-primary" onClick={model.reload}>Riprova</button></div>
  const current = model.month === model.currentMonth
  const totalBudget = current && extras.budgets.data?.month === model.month && extras.budgets.data.total_budget?.active && !extras.budgets.data.total_budget.orphaned ? extras.budgets.data.total_budget : null
  const cards: Record<HomeSectionId, ReactNode> = {
    portfolio: <PortfolioCard metrics={model.metrics} series={model.series} currency={model.currency} />,
    month: <MonthCard asOf={model.today} summary={model.summary} forecast={model.forecast} months={model.months} current={current} currency={model.currency} budget={totalBudget} onMonthChange={setMonth} />,
    flow: <FlowCard asOf={model.today} summary={model.summary} currency={model.currency} />,
    attention: <AttentionCard asOf={model.today} uncategorizedCount={model.uncategorizedCount} summary={model.summary} budgets={extras.budgets.data} sync={extras.sync.data} budgetError={extras.budgets.error} syncError={extras.sync.error} loading={extras.budgets.loading || extras.sync.loading} current={current && extras.budgets.data?.month === model.month} />,
    recent: <RecentTransactions transactions={model.recent} baseCurrency={model.currency} />,
    assistant: <AskCard period={model.month} onAsk={prompt => navigate('/financial-helper', { state: { prompt, sourcePath: `/dashboard?month=${model.month}` } })} />,
  }
  return <div className="dashboard home-page">
    <header className="home-header"><div><p className="home-date">{parseLocalDate(model.today).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p><h1>I tuoi soldi, il tuo spazio.</h1></div><Link className="btn btn-secondary" to="/projections/goals">Esplora il tuo futuro ↗</Link></header>
    <div className="home-grid">{homeSections.map(section => <div key={section.id} className={`home-slot home-slot-${section.width}`} data-section={section.id} style={{ '--mobile-order': section.mobileOrder } as CSSProperties}>{cards[section.id]}</div>)}</div>
    <p className="home-data-note">{model.summary.latestTransaction ? `Ultimo movimento registrato: ${formatDateLabel(model.summary.latestTransaction, { withYear: true })}.` : 'Nessun movimento importato.'} I dati riflettono i movimenti importati; i mesi potrebbero essere incompleti. <Link to="/settings/connections">Gestisci connessioni →</Link></p>
  </div>
}
