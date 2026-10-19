import { lazy, Suspense, useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, type TransactionRow, type Category } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import MoneyChart from '../components/MoneyChart'
import { fmtAmount, fmt } from '../utils/money'
import { useTheme } from '../useTheme'
import { useApi } from '../hooks/useApi'

import { baseAmount, summarizeCashFlow } from '../utils/cashFlow'
import { todayLocal } from '../utils/date'
const NetCashFlowHistory = lazy(() => import('./dashboard/NetCashFlowChartCard'))

function buildCashFlowTraces(summary: ReturnType<typeof summarizeCashFlow>) {
  const months = [...summary.months.keys()].sort()
  return [
    { x: months, y: months.map(m => summary.months.get(m)!.income), type: 'bar' as const, name: 'Entrate', marker: { color: '#3F7A55' } },
    { x: months, y: months.map(m => summary.months.get(m)!.spend), type: 'bar' as const, name: 'Spese', marker: { color: '#BE4A33' } },
    { x: months, y: months.map(m => summary.months.get(m)!.transfersOut), type: 'bar' as const, name: 'Trasferimenti in uscita', marker: { color: '#B8842B' } },
  ]
}

function buildCategoryTrace(rows: TransactionRow[], categories: Category[], transferCats: Set<string>, isDark: boolean) {
  const colorMap = Object.fromEntries(categories.map(c => [c.name, c.color]))
  const byCategory: Record<string, number> = {}
  for (const r of rows) {
    const amount = baseAmount(r)
    if (amount >= 0) continue
    if (transferCats.has(r.category ?? '')) continue
    const cat = r.category ?? 'Uncategorized'
    byCategory[cat] = (byCategory[cat] ?? 0) + Math.abs(amount)
  }
  // Group anything under 3% of the total into "Other" so small slices don't
  // clip their labels off the edge of the card.
  const total = Object.values(byCategory).reduce((s, v) => s + v, 0)
  const grouped: Record<string, number> = {}
  for (const [cat, value] of Object.entries(byCategory)) {
    const key = total > 0 && value / total < 0.03 ? 'Other' : cat
    grouped[key] = (grouped[key] ?? 0) + value
  }
  const labels = Object.keys(grouped)
  return [{
    labels,
    values: labels.map(l => grouped[l]),
    type: 'pie' as const,
    hole: 0.6,
    marker: { colors: labels.map(l => colorMap[l] ?? '#A88B5C'), line: { color: isDark ? '#242019' : '#F6F1E7', width: 2 } },
    textinfo: 'label+percent' as const,
    textposition: 'inside' as const,
    insidetextorientation: 'horizontal' as const,
    textfont: { size: 11, family: "'Hanken Grotesk', sans-serif" },
    hovertemplate: '%{label}: %{value:,.0f}<extra></extra>',
  }]
}

export default function Transactions({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1'
  const [historyOpen, setHistoryOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const filters = { account_id: searchParams.get('account_id') ?? '', start: searchParams.get('start') ?? '', end: searchParams.get('end') ?? '', search: searchParams.get('search') ?? '', category: searchParams.get('uncategorized') === '1' ? '__uncategorized__' : searchParams.get('category') ?? '' }
  function setFilters(update: (previous: typeof filters) => typeof filters) {
    const next = update(filters)
    setSearchParams(previous => {
      const params = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(next)) {
        if (key === 'category' && value === '__uncategorized__') params.delete(key)
        else if (value) params.set(key, value)
        else params.delete(key)
      }
      if (next.category === '__uncategorized__') params.set('uncategorized', '1')
      else params.delete('uncategorized')
      return params
    })
  }
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editCat, setEditCat]     = useState('')
  const navigate = useNavigate()
  const { isDark } = useTheme()

  const { data: loaded, loading, error, reload } = useApi(
    () => {
      const params: { account_id?: number; start?: string; end?: string } = {}
      if (filters.account_id) params.account_id = Number(filters.account_id)
      if (filters.start) params.start = filters.start
      if (filters.end) params.end = filters.end
      return Promise.all([api.transactions.list(params), api.categories.list()])
    },
    [filters.account_id, filters.start, filters.end],
  )
  const rows = useMemo(() => loaded?.[0] ?? [], [loaded])
  const categories = useMemo(() => loaded?.[1] ?? [], [loaded])

  const metadata = useApi(() => Promise.all([api.accounts.list(), api.settings.all()]), [])
  const accounts = useMemo(() => metadata.data?.[0] ?? [], [metadata.data])
  const baseCurrency = metadata.data?.[1].base_currency ?? 'EUR'

  async function saveCategory(id: number) {
    setSaving(true)
    setSaveError(null)
    try {
      await api.transactions.updateCategory(id, editCat || null)
      setEditingId(null)
      reload()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Try again.')
    } finally {
      setSaving(false)
    }
  }

  function categoryColor(name: string | null) {
    const cat = categories.find(c => c.name === name)
    return cat?.color ?? '#6B6253'
  }

  const visible = useMemo(() => {
    let result = rows
    if (filters.category === '__uncategorized__') result = result.filter(r => !r.category)
    else if (filters.category) result = result.filter(r => r.category === filters.category)
    const search = filters.search.toLowerCase()
    if (!search) return result
    return result.filter(r =>
      r.description.toLowerCase().includes(search) ||
      (r.reference ?? '').toLowerCase().includes(search) ||
      (r.category ?? '').toLowerCase().includes(search)
    )
  }, [rows, filters.search, filters.category])

  const transferCats   = useMemo(() => new Set(categories.filter(c => c.is_transfer).map(c => c.name)), [categories])
  const today = todayLocal()
  const cashFlow = useMemo(() => summarizeCashFlow(visible, categories, today), [visible, categories, today])
  const cashFlowTraces = useMemo(() => buildCashFlowTraces(cashFlow), [cashFlow])
  const categoryTraces = useMemo(() => buildCategoryTrace(visible.filter(r => r.date <= today), categories, transferCats, isDark), [visible, categories, transferCats, isDark, today])
  const accountCurrency = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a.currency])), [accounts])

  return (
    <div>
      <div className="page-header">
        {!embedded && <div><Heading>Movimenti</Heading><p>Cerca, filtra e organizza i tuoi movimenti</p></div>}
        <button className="btn btn-primary" onClick={() => navigate(`/import?type=transactions${filters.account_id ? '&account_id=' + filters.account_id : ''}`)}>↥ Importa movimenti</button>
      </div>

      {error && <Alert type="error">Impossibile caricare i movimenti: {error}</Alert>}
      {metadata.error && <Alert type="error">Impossibile caricare le valute dei conti: {metadata.error}</Alert>}
      {saveError && <Alert type="error">Impossibile salvare la categoria: {saveError}</Alert>}

      <div className="filter-bar" style={{ marginBottom: '18px' }}>
        <div className="filter-pill">
          <select aria-label="Filtra per conto" value={filters.account_id} onChange={e => setFilters(f => ({ ...f, account_id: e.target.value }))}>
            <option value="">Tutti i conti</option>
            {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          <select aria-label="Filtra per categoria" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
            <option value="">Tutte le categorie</option>
            <option value="__uncategorized__">Da classificare</option>
            {filters.category && filters.category !== '__uncategorized__' && !categories.some(c => c.name === filters.category) && <option value={filters.category}>{filters.category} (categoria non presente)</option>}
            {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        </div>
        <div className="filter-pill">
          <input aria-label="Data iniziale" type="date" value={filters.start} onChange={e => setFilters(f => ({ ...f, start: e.target.value }))} />
          <span style={{ color: 'var(--ink-ghost)' }}>–</span>
          <input aria-label="Data finale" type="date" value={filters.end} onChange={e => setFilters(f => ({ ...f, end: e.target.value }))} />
        </div>
        <div className="filter-search">
          <span className="filter-search-icon">⌕</span>
          <input
            aria-label="Cerca movimenti"
            placeholder="Cerca descrizione, riferimento o categoria…"
            value={filters.search}
            onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
          />
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '18px' }}>
        <div className="card">
          <div className="metric-label">Movimenti</div>
          <div className="metric-value" style={{ marginTop: '8px' }}>{visible.length.toLocaleString()}</div>
        </div>
        <div className="card">
          <div className="metric-label">Entrate</div>
          <div className="metric-value" style={{ marginTop: '8px', color: 'var(--gain)' }}>
            +{fmt(cashFlow.income, baseCurrency, { decimals: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Spese</div>
          <div className="metric-value" style={{ marginTop: '8px', color: 'var(--loss)' }}>
            {fmt(-cashFlow.spending, baseCurrency, { decimals: 2 })}
          </div>
        </div>
        <div className="card">
          <div className="metric-label">Trasferimenti in uscita</div>
          <div className="metric-value" style={{ marginTop: '8px', color: 'var(--accent)' }}>
            {fmt(cashFlow.transfersOut, baseCurrency, { decimals: 2 })}
          </div>
          <small>Trasferimenti classificati come investimento: {fmt(cashFlow.investmentFunding, baseCurrency)}. Compravendite interne escluse.</small>
        </div>
      </div>

      <p className="dashboard-data-note">Entrate e spese escludono trasferimenti tra conti e compravendite. Trasferire denaro a un conto di investimento non è un acquisto né una perdita. {cashFlow.futureCount > 0 && `${cashFlow.futureCount} future-dated transaction(s) excluded from totals.`}</p>
      {visible.length > 0 && (
        <div className="dashboard-grid">
          <div className="card">
            <div className="section-title">Flussi mensili</div>
            <MoneyChart
              data={cashFlowTraces}
              layout={{ barmode: 'group', yaxis: { tickformat: ',.0f' }, showlegend: true }}
              style={{ height: 260 }}
            />
          </div>
          <div className="card">
            <div className="section-title">Spese per categoria</div>
            <MoneyChart
              data={categoryTraces}
              layout={{ showlegend: false, margin: { t: 10, b: 10, l: 10, r: 10 } }}
              style={{ height: 260 }}
            />
          </div>
        </div>
      )}

      {loading && !loaded ? (
        <LoadingSpinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrizione</th>
                <th>Riferimento</th>
                <th style={{ textAlign: 'right' }}>Importo</th>
                <th>Conto</th>
                <th>Categoria</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--ink-faint)', fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>{r.date}</td>
                  <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500, color: 'var(--ink)' }}>{r.description}</td>
                  <td style={{ color: 'var(--ink-ghost)', fontSize: '11.5px', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reference}</td>
                  <td style={{
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    color: r.amount < 0 ? 'var(--ink)' : 'var(--gain)',
                  }}>
                    {r.amount >= 0 ? '+' : ''}{fmtAmount(r.amount)}
                    {accountCurrency[r.account_id] && (
                      <span style={{ marginLeft: 4, fontWeight: 400, fontSize: '11px', color: 'var(--ink-faint)' }}>
                        {accountCurrency[r.account_id]}
                      </span>
                    )}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--ink-muted)' }}>{r.account}</td>
                  <td>
                    {editingId === r.id ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <select aria-label="Categoria del movimento" disabled={saving} value={editCat} onChange={e => setEditCat(e.target.value)} style={{ fontSize: '0.75rem', padding: '0.2rem' }}>
                          <option value="">— none —</option>
                          {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                        <button aria-label="Salva categoria" disabled={saving} className="btn btn-primary btn-sm" onClick={() => saveCategory(r.id)}>{saving ? '…' : '✓'}</button>
                        <button aria-label="Cancel category edit" disabled={saving} className="btn btn-secondary btn-sm" onClick={() => { setEditingId(null); setSaveError(null) }}>✕</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={saving}
                        aria-label={`Modifica categoria per ${r.description}`}
                        className="badge"
                        style={{
                          background: r.category ? `${categoryColor(r.category)}22` : 'var(--bg-chip)',
                          color: r.category ? categoryColor(r.category) : 'var(--ink-muted)',
                          cursor: 'pointer',
                        }}
                        onClick={() => { setEditingId(r.id); setEditCat(r.category ?? ''); setSaveError(null) }}
                        title="Modifica categoria"
                      >
                        {r.category ?? 'Uncategorized'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '2rem' }}>Nessun movimento trovato</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <details className="transaction-history" onToggle={event => setHistoryOpen(event.currentTarget.open)}>
        <summary>Esplora il saldo mensile nel tempo</summary>
        {historyOpen && <Suspense fallback={<LoadingSpinner />}><NetCashFlowHistory transactions={rows} categories={categories} currency={baseCurrency} month={(filters.end || today).slice(0, 7)} asOf={today} /></Suspense>}
      </details>
    </div>
  )
}
