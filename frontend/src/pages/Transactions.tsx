import { useEffect, useState, useCallback, useMemo } from 'react'
import { api, type TransactionRow, type Account, type Category } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import MoneyChart, { fmtAmount } from '../components/MoneyChart'

function buildCashFlowTraces(rows: TransactionRow[], transferCats: Set<string>) {
  const byMonth: Record<string, { income: number; spend: number; invest: number }> = {}
  for (const r of rows) {
    const month = r.date.slice(0, 7)
    if (!byMonth[month]) byMonth[month] = { income: 0, spend: 0, invest: 0 }
    if (transferCats.has(r.category ?? '')) {
      byMonth[month].invest += Math.abs(r.amount)
    } else if (r.amount > 0) {
      byMonth[month].income += r.amount
    } else {
      byMonth[month].spend += Math.abs(r.amount)
    }
  }
  const months = Object.keys(byMonth).sort()
  return [
    { x: months, y: months.map(m => byMonth[m].income), type: 'bar' as const, name: 'Income',     marker: { color: '#10b981' } },
    { x: months, y: months.map(m => byMonth[m].spend),  type: 'bar' as const, name: 'Spending',   marker: { color: '#ef4444' } },
    { x: months, y: months.map(m => byMonth[m].invest), type: 'bar' as const, name: 'Investment', marker: { color: '#f59e0b' } },
  ]
}

function buildCategoryTrace(rows: TransactionRow[], categories: Category[]) {
  const colorMap = Object.fromEntries(categories.map(c => [c.name, c.color]))
  const byCategory: Record<string, number> = {}
  for (const r of rows) {
    if (r.amount >= 0) continue
    const cat = r.category ?? 'Uncategorized'
    byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(r.amount)
  }
  const labels = Object.keys(byCategory)
  return [{
    labels,
    values: labels.map(l => byCategory[l]),
    type: 'pie' as const,
    hole: 0.52,
    marker: { colors: labels.map(l => colorMap[l] ?? '#94a3b8'), line: { color: '#ffffff', width: 2 } },
    textinfo: 'label+percent' as const,
    textfont: { size: 11 },
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]
}

export default function Transactions() {
  const [rows, setRows]           = useState<TransactionRow[]>([])
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const [filters, setFilters]     = useState({ account_id: '', start: '', end: '', search: '', category: '' })
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCat, setEditCat]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const params: { account_id?: number; start?: string; end?: string } = {}
    if (filters.account_id) params.account_id = Number(filters.account_id)
    if (filters.start) params.start = filters.start
    if (filters.end) params.end = filters.end
    const [txns, cats] = await Promise.all([
      api.transactions.list(params),
      api.categories.list(),
    ])
    setRows(txns)
    setCategories(cats)
    setLoading(false)
  }, [filters.account_id, filters.start, filters.end])

  useEffect(() => {
    api.accounts.list().then(setAccounts)
  }, [])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  async function saveCategory(id: number) {
    await api.transactions.updateCategory(id, editCat)
    setEditingId(null)
    await load()
  }

  function categoryColor(name: string | null) {
    const cat = categories.find(c => c.name === name)
    return cat?.color ?? '#6b7280'
  }

  const visible = useMemo(() => {
    let result = rows
    if (filters.category) result = result.filter(r => r.category === filters.category)
    const search = filters.search.toLowerCase()
    if (!search) return result
    return result.filter(r =>
      r.description.toLowerCase().includes(search) ||
      (r.reference ?? '').toLowerCase().includes(search) ||
      (r.category ?? '').toLowerCase().includes(search)
    )
  }, [rows, filters.search, filters.category])

  const transferCats   = useMemo(() => new Set(categories.filter(c => c.is_transfer).map(c => c.name)), [categories])
  const totalIncome    = visible.filter(r => r.amount > 0 && !transferCats.has(r.category ?? '')).reduce((s, r) => s + r.amount, 0)
  const totalSpend     = visible.filter(r => r.amount < 0 && !transferCats.has(r.category ?? '')).reduce((s, r) => s + r.amount, 0)
  const totalInvest    = visible.filter(r => transferCats.has(r.category ?? '')).reduce((s, r) => s + r.amount, 0)
  const cashFlowTraces = useMemo(() => buildCashFlowTraces(visible, transferCats), [visible, transferCats])
  const categoryTraces = useMemo(() => buildCategoryTrace(visible, categories), [visible, categories])

  return (
    <div>
      <div className="page-header">
        <h1>Transactions</h1>
        <p>Browse, search, and categorise your transactions</p>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 2fr', gap: '0.75rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Account</label>
            <select value={filters.account_id} onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}>
              <option value="">All accounts</option>
              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Category</label>
            <select value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
              <option value="">All categories</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>From</label>
            <input type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>To</label>
            <input type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Search</label>
            <input
              placeholder="Description, reference, category…"
              value={filters.search}
              onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="metric-label">Transactions</div>
          <div className="metric-value" style={{ fontSize: '1.4rem' }}>{visible.length.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="metric-label">Income</div>
          <div className="metric-value" style={{ fontSize: '1.4rem', color: 'var(--accent-green)' }}>
            +{fmtAmount(totalIncome)}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Spending</div>
          <div className="metric-value" style={{ fontSize: '1.4rem', color: 'var(--danger)' }}>
            {fmtAmount(totalSpend)}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Investment</div>
          <div className="metric-value" style={{ fontSize: '1.4rem', color: 'var(--accent-blue, #60a5fa)' }}>
            {fmtAmount(totalInvest)}
          </div>
        </div>
      </div>

      {visible.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.5rem', marginBottom: '1rem' }}>
          <div className="card">
            <div className="section-title" style={{ marginBottom: '0.5rem' }}>Monthly Cash Flow</div>
            <MoneyChart
              data={cashFlowTraces}
              layout={{ barmode: 'group', yaxis: { tickformat: ',.0f' }, showlegend: true }}
              style={{ height: 240 }}
            />
          </div>
          <div className="card">
            <div className="section-title" style={{ marginBottom: '0.5rem' }}>Outflows by Category</div>
            <MoneyChart
              data={categoryTraces}
              layout={{ showlegend: false, margin: { t: 10, b: 10, l: 10, r: 10 } }}
              style={{ height: 240 }}
            />
          </div>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
                <th>Account</th>
                <th>Category</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.date}</td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reference}</td>
                  <td style={{
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    color: r.amount < 0 ? 'var(--danger)' : 'var(--accent-green)',
                  }}>
                    {r.amount >= 0 ? '+' : ''}{fmtAmount(r.amount)}
                  </td>
                  <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{r.account}</td>
                  <td>
                    {editingId === r.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select value={editCat} onChange={e => setEditCat(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.2rem' }}>
                          <option value="">— none —</option>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button className="btn btn-primary btn-sm" onClick={() => saveCategory(r.id)}>✓</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    ) : (
                      <span
                        className="badge"
                        style={{
                          background: r.category ? `${categoryColor(r.category)}22` : 'rgba(107,114,128,0.15)',
                          color: r.category ? categoryColor(r.category) : '#6b7b94',
                          cursor: 'pointer',
                          border: `1px solid ${r.category ? `${categoryColor(r.category)}44` : 'transparent'}`,
                        }}
                        onClick={() => { setEditingId(r.id); setEditCat(r.category ?? '') }}
                        title="Click to edit category"
                      >
                        {r.category ?? '—'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No transactions found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
