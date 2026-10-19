import { PixelCampfire } from '../../components/arcade/PixelArt'
import { Link } from 'react-router-dom'
import type { Metrics } from '../dashboard/data'
import { fmt } from '../../utils/money'
import { formatDateLabel, parseLocalDate } from '../../utils/date'

interface Props { metrics: Metrics; currency: string; series: { x: string[]; y: number[] } }

/** Real snapshot dates determine horizontal spacing; no resampling or smoothing. */
export default function PortfolioCard({ metrics: m, currency, series }: Props) {
  if (!m.accountCount) return <section className="home-panel home-welcome"><p className="eyebrow">Un punto di partenza</p><h2>Parti da quello che hai.</h2><p>Aggiungi un conto e il primo saldo. Il quadro del mese funziona anche senza.</p><Link className="btn btn-primary" to="/wealth/accounts">Aggiungi il primo conto →</Link></section>
  const comparison = m.comparisons.find(c => c.label === 'previous month')
  const times = series.x.map(d => parseLocalDate(d).getTime())
  const min = Math.min(...series.y), max = Math.max(...series.y)
  const span = max - min || 1, duration = (times.at(-1) ?? 0) - (times[0] ?? 0) || 1
  const points = series.y.map((value, i) => `${8 + (times[i] - times[0]) / duration * 584},${108 - (value - min) / span * 92}`).join(' ')
  return <section className="portfolio-panel" aria-labelledby="portfolio-title">
    <div className="panel-heading"><h2 id="portfolio-title">Patrimonio totale</h2><Link to="/wealth">Esplora ↗</Link></div>
    <PixelCampfire /><div className="portfolio-total">{fmt(m.totalNow, currency)}</div>
    <div className="portfolio-comparison">{comparison?.delta != null ? <><strong className={comparison.delta < 0 ? 'portfolio-negative' : 'portfolio-positive'}>{comparison.delta > 0 ? '+' : ''}{fmt(comparison.delta, currency)}</strong><span>rispetto al {formatDateLabel(comparison.date)}{comparison.accounts < m.accountCount ? ` · ${comparison.accounts}/${m.accountCount} conti confrontabili` : ''}</span></> : <span>Il confronto mensile apparirà con più storico.</span>}</div>
    {series.x.length > 1 ? <div className="portfolio-chart"><svg viewBox="0 0 600 124" role="img" aria-label={`Andamento del patrimonio dal ${formatDateLabel(series.x[0])} al ${formatDateLabel(series.x.at(-1)!)}; valore finale ${fmt(m.totalNow, currency)}`}>
      {[28, 72, 116].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} className="portfolio-guide" />)}
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      <rect className="arcade-chart-marker" x="589" y={105 - ((series.y.at(-1)! - min) / span) * 92} width="6" height="6" fill="currentColor" />
      <circle cx="592" cy={108 - ((series.y.at(-1)! - min) / span) * 92} r="4" fill="currentColor" />
    </svg><div className="portfolio-dates"><span>{formatDateLabel(series.x[0], { withYear: true })}</span><span>{formatDateLabel(series.x.at(-1)!, { withYear: true })}</span></div></div> : <p className="portfolio-note">Il grafico apparirà dal prossimo aggiornamento del saldo.</p>}
    <div className="portfolio-allocation"><div><span>Liquidità</span><strong>{fmt(m.liquid, currency)}</strong></div><div><span>Altri saldi</span><strong>{fmt(m.totalNow - m.liquid, currency)}</strong></div><Link to="/wealth/accounts">{m.accountCount} conti →</Link></div>
    <details className="portfolio-method"><summary>Date e composizione</summary><p>Saldi registrati dal {formatDateLabel(m.oldestDate, { withYear: true })} al {formatDateLabel(m.latestDate, { withYear: true })}. Per ogni conto usiamo l’ultimo saldo disponibile. Le variazioni includono versamenti e prelievi e non rappresentano il rendimento.</p></details>
  </section>
}
