import { useNavigate } from 'react-router-dom'
import type { TransactionRow } from '../../api/client'
import { fmt } from '../../utils/money'
import { formatDateLabel } from '../../utils/date'

interface Props {
  transactions: TransactionRow[]
  baseCurrency: string
}

export default function RecentTransactions({ transactions, baseCurrency }: Props) {
  const navigate = useNavigate()

  return (
    <div className="card" style={{ padding: '8px 6px 6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px 12px' }}>
        <div className="section-title" style={{ marginBottom: 0 }}>Recent transactions</div>
        <button className="btn-link" onClick={() => navigate('/transactions')}>View all →</button>
      </div>
      {transactions.length === 0 ? (
        <div style={{ padding: '1.5rem', color: 'var(--ink-faint)', textAlign: 'center', fontSize: '0.85rem' }}>
          No transactions yet
        </div>
      ) : (
        transactions.map(t => (
          <div
            key={t.id}
            style={{ display: 'grid', gridTemplateColumns: '64px 1fr 130px 120px', alignItems: 'center', gap: 14, padding: '11px 18px', borderTop: '1px solid var(--border-soft)' }}
          >
            <span style={{ fontSize: '12.5px', color: 'var(--ink-faint)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
              {formatDateLabel(t.date)}
            </span>
            <span style={{ fontSize: '13.5px', color: 'var(--ink)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={t.description}>
              {t.description}
            </span>
            <span style={{ justifySelf: 'start' }}>
              {t.category ? <span className="badge" style={{ background: 'var(--bg-chip)', color: 'var(--ink-muted)' }}>{t.category}</span> : '—'}
            </span>
            <span style={{ textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: t.amount >= 0 ? 'var(--gain)' : 'var(--ink)', whiteSpace: 'nowrap' }}>
              {t.amount >= 0 ? '+' : ''}{fmt(t.amount_base ?? t.amount, baseCurrency, { decimals: 2 })}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
