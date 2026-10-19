import { useId } from 'react'
import { ArrowDownLeft, ArrowUpRight, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import { transactionPeriodLink } from '../../navigation/links'
import type { MonthSummary } from '../dashboard/data'
import { fmt } from '../../utils/money'
import { formatMonthLabel } from '../../utils/date'
import { moneyFlowLayout, flowRibbon, type FlowCategory } from './moneyFlowLayout'
import '../../styles/money-flow.css'

function categoryLink(periodLink: string, category: FlowCategory) {
  if (category.grouped) return periodLink
  const query = new URLSearchParams(periodLink.split('?')[1])
  query.set(category.name === 'Uncategorized' ? 'uncategorized' : 'category', category.name === 'Uncategorized' ? '1' : category.name)
  return `/transactions?${query}`
}
const label = (name: string) => name === 'Uncategorized' ? 'Da classificare' : name

/** Presentation only: income + deficit = spending + surplus, including all categories. */
export default function FlowCard({ summary: s, currency, asOf }: { summary: MonthSummary; currency: string; asOf: string }) {
  const id = useId().replace(/:/g, '')
  const layout = moneyFlowLayout(s)
  const periodLink = transactionPeriodLink(s.month, asOf)
  const deficit = Math.max(0, -s.net)
  const surplus = Math.max(0, s.net)
  const coverage = s.spending > 0 ? Math.min(100, s.income / s.spending * 100) : null
  const title = `Entrate ${fmt(s.income, currency)}, spese ${fmt(s.spending, currency)}, ${s.net < 0 ? 'liquidità assorbita' : 'avanzo'} ${fmt(Math.abs(s.net), currency)}`
  return <section className="home-panel flow-panel" aria-labelledby={`flow-title-${id}`}>
    <div className="panel-heading"><div><h2 id={`flow-title-${id}`}>Dove scorre il tuo denaro</h2><p className="home-caption">{formatMonthLabel(s.month)} · movimenti registrati</p></div><Link to={periodLink}>Dettagli ↗</Link></div>
    {Math.max(s.income, s.spending) > 0 ? <>
      <div className="flow-reading"><span className="flow-reading-dot" />{coverage !== null ? <>Le entrate coprono <strong>{coverage.toFixed(0)}%</strong> delle spese</> : <>Non risultano spese registrate nel mese</>}</div>
      <div className="flow-map" aria-label={title} role="group">
        <svg viewBox={`0 0 740 ${Math.max(350, layout.surplusY + layout.surplus + 28)}`} aria-labelledby={`river-title-${id}`}>
          <title id={`river-title-${id}`}>{title}. Seleziona una categoria per vedere i movimenti.</title>
          <defs>
            <linearGradient id={`income-${id}`}><stop stopColor="var(--flow-income-ink)" stopOpacity=".15" /><stop offset="1" stopColor="var(--flow-income-ink)" stopOpacity=".5" /></linearGradient>
            <linearGradient id={`deficit-${id}`}><stop stopColor="var(--flow-saving)" stopOpacity=".12" /><stop offset="1" stopColor="var(--flow-saving)" stopOpacity=".5" /></linearGradient>
            <linearGradient id={`surplus-${id}`}><stop stopColor="var(--flow-saving)" stopOpacity=".16" /><stop offset="1" stopColor="var(--flow-saving)" stopOpacity=".55" /></linearGradient>
          </defs>
          {layout.funded > 0 && <path d={flowRibbon(150, layout.incomeY, 342, layout.expenseY, layout.funded)} fill={`url(#income-${id})`} />}
          {layout.deficit > 0 && <path d={flowRibbon(150, layout.deficitY, 342, layout.expenseY + layout.funded, layout.deficit)} fill={`url(#deficit-${id})`} />}
          {layout.surplus > 0 && <path d={flowRibbon(150, layout.incomeY + layout.funded, 548, layout.surplusY, layout.surplus)} fill={`url(#surplus-${id})`} />}
          <g className="flow-source-label"><text x="0" y={layout.incomeY + s.income * layout.scale / 2 - 9}>Entrate</text><text x="0" y={layout.incomeY + s.income * layout.scale / 2 + 18} className="flow-map-value">{fmt(s.income, currency)}</text></g>
          {s.income > 0 && <rect x="144" y={layout.incomeY} width="6" height={s.income * layout.scale} rx="3" className="flow-income-mark" />}
          {deficit > 0 && <g className="flow-source-label"><rect x="144" y={layout.deficitY} width="6" height={layout.deficit} rx="3" className="flow-deficit-mark" /><text x="0" y="271">Liquidità assorbita</text><text x="0" y="298" className="flow-map-value flow-map-deficit">{fmt(deficit, currency)}</text></g>}
          {s.spending > 0 && <>
            <rect x="342" y={layout.expenseY} width="6" height={s.spending * layout.scale} rx="3" className="flow-spending-mark" />
            <text x="345" y={layout.expenseY - 36} textAnchor="middle" className="flow-hub-label">Spese</text><text x="345" y={layout.expenseY - 12} textAnchor="middle" className="flow-hub-value">{fmt(s.spending, currency)}</text>
          </>}
          {layout.branches.map(category => <Link key={category.grouped ? '__remainder__' : category.name} to={categoryLink(periodLink, category)} className="flow-branch" aria-label={`${label(category.name)}: ${fmt(category.amount, currency)}, ${(category.amount / s.spending * 100).toFixed(0)}%. Vedi movimenti`}>
            <path d={flowRibbon(348, category.sourceY, 548, category.targetY, category.height)} fill={category.color} className="flow-category-ribbon" />
            <rect x="548" y={category.targetY} width="6" height={category.height} rx="3" fill={category.color} className="flow-target" />
            <text x="570" y={category.targetY + category.height / 2 - 4} className="flow-category-name">{label(category.name).length > 20 ? label(category.name).slice(0, 19) + '…' : label(category.name)}</text>
            <text x="570" y={category.targetY + category.height / 2 + 19} className="flow-category-value">{fmt(category.amount, currency)}<tspan dx="10" className="flow-category-share">{(category.amount / s.spending * 100).toFixed(0)}%</tspan></text>
            <title>{label(category.name)} · {fmt(category.amount, currency)}</title>
          </Link>)}
          {surplus > 0 && <g><rect x="548" y={layout.surplusY} width="6" height={layout.surplus} rx="3" className="flow-deficit-mark" /><text x="570" y={layout.surplusY + layout.surplus / 2 - 4} className="flow-category-name">Avanzo del mese</text><text x="570" y={layout.surplusY + layout.surplus / 2 + 20} className="flow-category-value flow-map-surplus">{fmt(surplus, currency)}</text></g>}
        </svg>
      </div>
      <div className="flow-compact">
        <dl className="flow-compact-sources"><div><dt><ArrowDownLeft size={15} />Entrate</dt><dd>{fmt(s.income, currency)}</dd></div><div><dt>{deficit > 0 ? <Wallet size={15} /> : <ArrowUpRight size={15} />}{deficit > 0 ? 'Liquidità assorbita' : 'Avanzo'}</dt><dd className={deficit > 0 ? 'text-loss' : 'text-gain'}>{fmt(deficit || surplus, currency)}</dd></div></dl>
        <div className="flow-compact-heading"><span>Spese</span><strong>{fmt(s.spending, currency)}</strong></div>
        <ul className="flow-compact-categories">{layout.branches.map(c => <li key={c.grouped ? '__remainder__' : c.name}><Link to={categoryLink(periodLink, c)}><span className="flow-category-dot" style={{ background: c.color }} /><span>{label(c.name)}</span><strong>{fmt(c.amount, currency)}</strong><small>{(c.amount / s.spending * 100).toFixed(0)}%</small><span className="flow-compact-track"><span style={{ width: `${c.amount / s.spending * 100}%`, background: c.color }} /></span></Link></li>)}</ul>
      </div>
      <p className="flow-bottom-note">{s.net < 0 ? 'Le spese superano le entrate registrate: la differenza assorbe liquidità.' : 'L’avanzo è la differenza tra entrate e spese registrate.'} Trasferimenti e compravendite esclusi.</p>
    </> : <div className="dashboard-empty"><p>Nessuna spesa registrata per questo mese.</p><Link className="btn btn-secondary" to="/import?type=transactions">Importa movimenti</Link></div>}
  </section>
}
