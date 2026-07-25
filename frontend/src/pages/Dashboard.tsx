import { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type AssistantInsight } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { useApi } from '../hooks/useApi'
import { useTheme } from '../useTheme'
import {
  computeMetrics, computeNetWorthSeries, buildAccountTraces, buildSparkline, buildSankeyData, greeting,
} from './dashboard/data'
import HeroCard from './dashboard/HeroCard'
import InsightsCard from './dashboard/InsightsCard'
import NetWorthChartCard from './dashboard/NetWorthChartCard'
import AllocationCard from './dashboard/AllocationCard'
import CashFlowCard from './dashboard/CashFlowCard'
import BudgetsWidget from './dashboard/BudgetsWidget'
import AccountsOverTime from './dashboard/AccountsOverTime'
import RecentTransactions from './dashboard/RecentTransactions'

export default function Dashboard() {
  const [insights, setInsights]         = useState<AssistantInsight[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const navigate = useNavigate()

  function askHelper(prompt: string) {
    navigate('/financial-helper', { state: { prompt } })
  }

  const { data: loaded, loading, error } = useApi(
    () => Promise.all([
      api.balances.list(),
      api.transactions.list(),
      api.categories.list(),
      api.budgets.list().catch(() => null),
      api.settings.all(),
    ]),
    [],
  )
  const balances = useMemo(() => loaded?.[0] ?? [], [loaded])
  const transactions = useMemo(() => loaded?.[1] ?? [], [loaded])
  const categories = useMemo(() => loaded?.[2] ?? [], [loaded])
  const budgets = loaded ? loaded[3] : null
  const baseCurrency = loaded ? (loaded[4].base_currency ?? 'EUR') : 'EUR'

  useEffect(() => {
    api.assistant.insights()
      .then(res => setInsights(res.insights))
      .catch(() => setInsights([]))
      .finally(() => setInsightsLoading(false))
  }, [])

  const metrics       = useMemo(() => computeMetrics(balances), [balances])
  const nwSeries      = useMemo(() => computeNetWorthSeries(balances), [balances])
  const accountTraces = useMemo(() => buildAccountTraces(balances), [balances])
  const spark    = useMemo(() => buildSparkline(nwSeries.y), [nwSeries])
  const sankey   = useMemo(() => buildSankeyData(transactions, categories), [transactions, categories])

  const delta    = metrics.totalNow - metrics.totalPrev
  const pct      = metrics.totalPrev ? (delta / metrics.totalPrev) * 100 : 0
  const invested = metrics.totalNow - metrics.liquid
  const liquidPct = metrics.totalNow ? Math.round((metrics.liquid / metrics.totalNow) * 100) : 0

  // Net-worth growth since 1 Jan
  const ytdPct = useMemo(() => {
    const jan1 = `${new Date().getFullYear()}-01-01`
    const idx = nwSeries.x.findIndex(d => d >= jan1)
    if (idx < 0 || idx >= nwSeries.y.length - 1 || nwSeries.y[idx] <= 0) return null
    return ((nwSeries.y[nwSeries.y.length - 1] - nwSeries.y[idx]) / nwSeries.y[idx]) * 100
  }, [nwSeries])

  const { isDark } = useTheme()
  const inkColor = isDark ? '#F4EEE2' : '#241F18'

  const nwTrace = {
    x: nwSeries.x,
    y: nwSeries.y,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    name: 'Net Worth',
    line: { color: '#B8842B', width: 2.5, shape: 'spline' as const },
    marker: { color: '#F6F1E7', size: 6, line: { color: '#B8842B', width: 1.8 } },
    fill: 'tozeroy' as const,
    fillcolor: 'rgba(184,132,43,0.16)',
  }

  const allocTrace = [{
    labels: metrics.byType.map(g => g.type),
    values: metrics.byType.map(g => g.now),
    type: 'pie' as const,
    hole: 0.66,
    sort: false,
    direction: 'clockwise' as const,
    marker: { colors: metrics.byType.map(g => g.color), line: { color: isDark ? '#242019' : '#F6F1E7', width: 2 } },
    textinfo: 'none' as const,
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]

  if (loading) return <LoadingSpinner />

  if (error) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <Alert type="error">Couldn't load your dashboard data: {error}</Alert>
    </div>
  )

  if (!balances.length) return (
    <div>
      <div className="page-header"><h1>Dashboard</h1></div>
      <Alert type="info">No balance data yet. Go to <strong>Accounts &amp; FX</strong> to add accounts, then record balance snapshots or import data.</Alert>
    </div>
  )

  const recentTx = transactions.slice(0, 6)

  // Top per-category budgets by usage for the widget (pct null = over → first).
  // The "All spending" total cap is shown as the widget's headline, not a row.
  const totalBudget = budgets?.total_budget ?? null
  const widgetRows = (budgets?.budgets ?? [])
    .filter(b => b.active && !b.orphaned && b.category_name !== '__total__')
    .sort((a, b) => (b.pct ?? 999) - (a.pct ?? 999))
    .slice(0, 5)

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{greeting()}</h1>
          <p>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/balances')}>+ Add balance</button>
      </div>

      <HeroCard metrics={metrics} baseCurrency={baseCurrency} spark={spark} delta={delta} pct={pct} invested={invested} liquidPct={liquidPct} />

      <InsightsCard insights={insights} loading={insightsLoading} onAskHelper={askHelper} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '18px', marginBottom: '18px' }}>
        <NetWorthChartCard nwTrace={nwTrace} ytdPct={ytdPct} />
        <AllocationCard metrics={metrics} allocTrace={allocTrace} inkColor={inkColor} />
      </div>

      {(sankey || widgetRows.length > 0 || totalBudget) && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: sankey && (widgetRows.length > 0 || totalBudget) ? '1.6fr 1fr' : '1fr',
          gap: '18px', marginBottom: '18px', alignItems: 'start',
        }}>
          {sankey && <CashFlowCard sankey={sankey} />}
          {(widgetRows.length > 0 || totalBudget) && budgets && (
            <BudgetsWidget budgets={budgets} totalBudget={totalBudget} widgetRows={widgetRows} />
          )}
        </div>
      )}

      <AccountsOverTime accountTraces={accountTraces} />

      <RecentTransactions transactions={recentTx} baseCurrency={baseCurrency} />
    </div>
  )
}
