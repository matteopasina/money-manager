import { ArrowUpRight, Check, CircleAlert, Tags, Unplug } from 'lucide-react'
import { transactionPeriodLink } from '../../navigation/links'
import { Link } from 'react-router-dom'
import type { BudgetsStatus, SyncStatus } from '../../api/client'
import type { MonthSummary } from '../dashboard/data'
import { fmt } from '../../utils/money'

export default function AttentionCard({ summary, budgets, sync, budgetError, syncError, loading, current, uncategorizedCount, asOf }: {
  summary: MonthSummary; budgets: BudgetsStatus | null; sync: SyncStatus | null
  budgetError: string | null; syncError: string | null; loading: boolean; current: boolean; uncategorizedCount: number; asOf: string
}) {
  const items = []
  for (const connection of sync?.integrations ?? []) {
    if (connection.configured && connection.last_status === 'error') items.push({
      id: `sync-${connection.id}`, icon: Unplug, title: connection.name, body: 'La sincronizzazione richiede un controllo', to: '/settings/connections',
    })
  }
  if (current) {
    const over = [...(budgets?.budgets ?? []), ...(budgets?.total_budget ? [budgets.total_budget] : [])]
      .filter((b, index, rows) => b.active && !b.orphaned && b.remaining < 0 && rows.findIndex(r => r.id === b.id) === index)
      .sort((a, b) => a.remaining - b.remaining)
    if (over[0]) items.push({ id: 'budget', icon: CircleAlert, title: over[0].category_name === '__total__' ? 'Budget complessivo' : over[0].category_name, body: `${fmt(-over[0].remaining, budgets!.currency)} oltre il limite`, to: '/budgets' })
  }
  if (uncategorizedCount) items.push({ id: 'categories', icon: Tags, title: `${uncategorizedCount} ${uncategorizedCount === 1 ? 'movimento da classificare' : 'movimenti da classificare'}`, body: 'Dai un posto a questi movimenti', to: transactionPeriodLink(summary.month, asOf, true) })
  return <section className="home-panel attention-panel" aria-labelledby="attention-title">
    <div className="panel-heading"><h2 id="attention-title">Da tenere a fuoco</h2></div>
    {loading ? <p role="status" className="home-caption">Controllo budget e connessioni…</p> : items.length ? <ul className="attention-list">{items.slice(0, 3).map(({ id, icon: Icon, title, body, to }) => <li key={id}><Link to={to}><span className="attention-icon"><Icon size={18} /></span><span><strong>{title}</strong><small>{body}</small></span><ArrowUpRight size={16} aria-hidden="true" /></Link></li>)}</ul> : <div className="attention-clear"><Check size={22} /><p>{budgetError || syncError ? 'Nessuna priorità nei dati disponibili.' : 'Tutto al suo posto.'}</p><span>Nessun movimento da classificare nel mese selezionato.</span></div>}
    {budgetError && <p className="home-caption" role="status">Budget non disponibili. <Link to="/budgets">Apri Budget →</Link></p>}
    {syncError && <p className="home-caption" role="status">Stato connessioni non disponibile. <Link to="/settings/connections">Controlla →</Link></p>}
    <Link className="home-text-link" to="/budgets">Controlla i tuoi budget →</Link>
  </section>
}
