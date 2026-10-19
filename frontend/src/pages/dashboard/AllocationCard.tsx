import { ACCOUNT_TYPE_LABELS } from '../../constants'
import { Link } from 'react-router-dom'
import { fmt } from '../../utils/money'
import type { Metrics } from './data'

export default function AllocationCard({ metrics, currency }: { metrics: Metrics; currency: string }) {
  const positiveTotal = metrics.byType.reduce((sum, g) => sum + Math.max(0, g.now), 0)
  return (
    <section className="card" aria-labelledby="allocation-heading">
      <div className="dashboard-section-header"><div><h2 id="allocation-heading">Composizione del patrimonio</h2><p>Ultimi saldi registrati · {currency}</p></div><Link className="btn-link" to="/accounts">Gestisci →</Link></div>
      {positiveTotal > 0 && <div className="allocation-strip" aria-hidden="true">
        {metrics.byType.filter(g => g.now > 0).map(g => <span key={g.type} style={{ flex: g.now / positiveTotal, background: g.color }} />)}
      </div>}
      <ul className="allocation-list">
        {metrics.byType.map(g => <li key={g.type}>
          <span className="allocation-dot" style={{ background: g.color }} aria-hidden="true" />
          <div><strong>{ACCOUNT_TYPE_LABELS[g.type] ?? g.type}</strong><small>{g.accounts.length} {g.accounts.length === 1 ? 'conto' : 'conti'}</small></div>
          <div className="allocation-amount"><strong>{fmt(g.now, currency)}</strong><small>{g.now < 0 ? 'Saldo negativo' : positiveTotal > 0 ? `${(g.now / positiveTotal * 100).toFixed(1)}% dei saldi positivi` : 'Nessun saldo positivo'}</small></div>
        </li>)}
      </ul>
    </section>
  )
}
