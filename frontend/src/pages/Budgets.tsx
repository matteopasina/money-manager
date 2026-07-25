import { useState, useMemo } from 'react'
import { api, TOTAL_BUDGET } from '../api/client'
import type { BudgetsStatus, BudgetRow, BudgetHistory, BudgetSuggestions, Category } from '../api/client'
import MoneyChart from '../components/MoneyChart'
import { fmt } from '../utils/money'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { budgetBarColor, budgetBarWidth, budgetLabel } from '../utils/budgetDisplay'
import { formatMonthLabel } from '../utils/date'
import { useApi } from '../hooks/useApi'

const EMPTY_FORM = { category_name: '', monthly_amount: '', rollover: false }

export default function Budgets() {
  const [histMonths, setHistMonths] = useState(6)
  const [histBudget, setHistBudget] = useState<number | 'all'>('all')
  const [editing, setEditing]       = useState<BudgetRow | null>(null)
  const [form, setForm]             = useState(EMPTY_FORM)
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // suggest()/history() degrade gracefully (they're supplementary) — only a
  // budgets.list()/categories.list() failure surfaces as a page-level error.
  const { data: loaded, loading, error, reload } = useApi(
    () => Promise.all([
      api.budgets.list(),
      api.categories.list(),
      api.budgets.suggest().catch(() => null),
      api.budgets.history(histMonths).catch(() => null),
    ]),
    [histMonths],
  )
  const status: BudgetsStatus | null = loaded ? loaded[0] : null
  const categories: Category[] = useMemo(() => loaded?.[1] ?? [], [loaded])
  const suggestions: BudgetSuggestions | null = loaded ? loaded[2] : null
  const history: BudgetHistory | null = loaded ? loaded[3] : null

  const budgetedNames = useMemo(() => new Set(status?.budgets.map(b => b.category_name) ?? []), [status])
  const selectableCategories = useMemo(
    () => categories.filter(c =>
      !c.is_income && !c.is_transfer &&
      (!budgetedNames.has(c.name) || c.name === editing?.category_name)
    ),
    [categories, budgetedNames, editing]
  )

  const suggestionFor = (name: string) =>
    suggestions?.suggestions.find(s => s.category_name === name) ?? null

  function startEdit(b: BudgetRow) {
    setEditing(b)
    setForm({ category_name: b.category_name, monthly_amount: String(b.monthly_amount), rollover: b.rollover })
  }

  function cancelEdit() {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const amount = parseFloat(form.monthly_amount)
    if (!form.category_name || isNaN(amount) || amount <= 0) {
      return setMsg({ type: 'error', text: 'Pick a category and a positive monthly amount.' })
    }
    setSaving(true)
    try {
      const body = { category_name: form.category_name, monthly_amount: amount, rollover: form.rollover, active: editing?.active ?? true }
      if (editing) await api.budgets.update(editing.id, body)
      else await api.budgets.create(body)
      setMsg({ type: 'success', text: editing ? 'Budget updated.' : 'Budget created.' })
      cancelEdit()
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function remove(b: BudgetRow) {
    if (!confirm(`Delete the ${budgetLabel(b.category_name)} budget?`)) return
    try {
      await api.budgets.delete(b.id)
      if (editing?.id === b.id) cancelEdit()
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  async function setActive(b: BudgetRow, active: boolean) {
    try {
      await api.budgets.update(b.id, {
        category_name: b.category_name, monthly_amount: b.monthly_amount, rollover: b.rollover, active,
      })
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    }
  }

  // History chart traces: single budget or element-wise sum of all
  const histTraces = useMemo(() => {
    if (!history || history.series.length === 0) return []
    const sel = histBudget === 'all' ? history.series : history.series.filter(s => s.id === histBudget)
    if (sel.length === 0) return []
    const n = history.months.length
    const sum = (key: 'effective' | 'spent') =>
      Array.from({ length: n }, (_, i) =>
        sel.reduce((acc, s) => acc + (s[key][i] ?? 0), 0) || null)
    const effective = sum('effective')
    const spent = sum('spent')
    return [
      {
        x: history.months, y: effective, type: 'bar' as const, name: 'Budget',
        marker: { color: 'rgba(184,132,43,0.35)' },
      },
      {
        x: history.months, y: spent, type: 'bar' as const, name: 'Spent',
        marker: { color: history.months.map((_, i) => ((spent[i] ?? 0) > (effective[i] ?? Infinity) ? '#BE4A33' : '#3F7A55')) },
      },
    ]
  }, [history, histBudget])

  if (loading) return <LoadingSpinner />

  if (error || !status) return (
    <div>
      <div className="page-header"><h1>Budgets</h1></div>
      <Alert type="error">Couldn't load budgets{error ? `: ${error}` : ''}.</Alert>
    </div>
  )

  const totalRow = status.total_budget   // active "All spending" cap, or null
  const active   = status.budgets.filter(b => b.active && b.category_name !== TOTAL_BUDGET)
  const inactive = status.budgets.filter(b => !b.active)
  const monthLabel = formatMonthLabel(status.month, { withYear: true })

  // totals.* deliberately exclude the "All spending" cap (it overlaps every
  // category budget). When it's the only budget, the tiles must show it
  // instead of a hardcoded zero.
  const summary = active.length === 0 && totalRow
    ? { budgeted: totalRow.monthly_amount, effective: totalRow.effective, spent: totalRow.spent, remaining: totalRow.remaining }
    : status.totals
  const summaryLabel = active.length === 0 && totalRow ? 'All spending' : active.length > 0 && totalRow ? 'Category budgets' : 'Budgeted'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Budgets</h1>
          <p>Monthly spending limits per category · amounts in base currency ({status.currency})</p>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 13, marginBottom: 18 }}>
        <div className="card">
          <div className="metric-label">{summaryLabel} · {monthLabel}</div>
          <div className="metric-value" style={{ marginTop: 8 }}>{fmt(summary.effective, status.currency)}</div>
          {Math.abs(summary.effective - summary.budgeted) >= 0.5 && (
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', marginTop: 3 }}>
              {fmt(summary.budgeted, status.currency)} base {summary.effective > summary.budgeted ? '+' : '−'} {fmt(Math.abs(summary.effective - summary.budgeted), status.currency)} carried
            </div>
          )}
        </div>
        <div className="card">
          <div className="metric-label">Spent</div>
          <div className="metric-value" style={{ marginTop: 8 }}>{fmt(summary.spent, status.currency)}</div>
        </div>
        <div className="card">
          <div className="metric-label">Remaining</div>
          <div className="metric-value" style={{ marginTop: 8, color: summary.remaining >= 0 ? 'var(--gain)' : 'var(--loss)' }}>
            {fmt(summary.remaining, status.currency)}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, alignItems: 'start', marginBottom: 18 }}>
        {/* Budget rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {status.budgets.length === 0 && (
            <Alert type="info">No budgets yet. Pick a category and a monthly limit to start.</Alert>
          )}
          {totalRow && (
            <div style={{ marginBottom: 4 }}>
              <BudgetCard b={totalRow} currency={status.currency} pinned
                onEdit={() => startEdit(totalRow)} onDelete={() => remove(totalRow)}
                onDeactivate={() => setActive(totalRow, false)} />
            </div>
          )}
          {active.map(b => (
            <BudgetCard key={b.id} b={b} currency={status.currency}
              onEdit={() => startEdit(b)} onDelete={() => remove(b)}
              onDeactivate={() => setActive(b, false)} />
          ))}
          {inactive.length > 0 && (
            <>
              <div className="metric-label" style={{ marginTop: 8 }}>Inactive</div>
              {inactive.map(b => (
                <div key={b.id} style={{ opacity: 0.55 }}>
                  <BudgetCard b={b} currency={status.currency}
                    onEdit={() => startEdit(b)} onDelete={() => remove(b)}
                    onReactivate={() => setActive(b, true)} />
                </div>
              ))}
            </>
          )}
        </div>

        {/* Create / edit form */}
        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="section-title" style={{ fontSize: 16, marginBottom: '1rem' }}>
            {editing ? `Edit ${budgetLabel(editing.category_name)} budget` : 'New budget'}
          </div>
          <form onSubmit={save}>
            <div className="form-group">
              <label>Category</label>
              <select
                value={form.category_name}
                onChange={e => setForm(f => ({ ...f, category_name: e.target.value }))}
                disabled={!!editing}
                required
              >
                <option value="">Select category…</option>
                {(!budgetedNames.has(TOTAL_BUDGET) || editing?.category_name === TOTAL_BUDGET) && (
                  <option value={TOTAL_BUDGET}>All spending (total cap)</option>
                )}
                {selectableCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Monthly amount ({status.currency})</label>
              <input
                type="number" step="1" min="1" placeholder="e.g. 300"
                value={form.monthly_amount}
                onChange={e => setForm(f => ({ ...f, monthly_amount: e.target.value }))}
                required
              />
              {form.category_name && suggestionFor(form.category_name) && (
                <button
                  type="button" className="btn-link"
                  style={{ fontSize: '0.75rem', marginTop: 4 }}
                  onClick={() => setForm(f => ({ ...f, monthly_amount: String(Math.ceil(suggestionFor(f.category_name)!.avg_monthly_spend)) }))}
                >
                  Avg last 6 months: {fmt(suggestionFor(form.category_name)!.avg_monthly_spend, status.currency)} · {suggestionFor(form.category_name)!.months_with_data} mo of data — use it
                </button>
              )}
            </div>
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.rollover}
                  onChange={e => setForm(f => ({ ...f, rollover: e.target.checked }))}
                  style={{ width: 'auto' }}
                />
                Roll over unused budget
              </label>
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginTop: 4 }}>
                Unused (or overspent) budget carries into the next month{editing ? `, accumulating since ${editing.start_month}` : ', starting this month'}.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create budget'}
              </button>
              {editing && <button type="button" className="btn btn-secondary" onClick={cancelEdit}>Cancel</button>}
            </div>
          </form>
        </div>
      </div>

      {/* History */}
      {history && history.series.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Budget vs. spent</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <select value={histBudget} onChange={e => setHistBudget(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={{ width: 'auto' }}>
                <option value="all">All budgets</option>
                {history.series.map(s => <option key={s.id} value={s.id}>{budgetLabel(s.category_name)}</option>)}
              </select>
              <select value={histMonths} onChange={e => setHistMonths(Number(e.target.value))} style={{ width: 'auto' }}>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
              </select>
            </div>
          </div>
          <MoneyChart
            data={histTraces}
            layout={{ barmode: 'group', yaxis: { tickformat: ',.0f' }, showlegend: true }}
            style={{ height: 260 }}
          />
        </div>
      )}
    </div>
  )
}

function BudgetCard({ b, currency, onEdit, onDelete, onReactivate, onDeactivate, pinned }: {
  b: BudgetRow
  currency: string
  onEdit: () => void
  onDelete: () => void
  onReactivate?: () => void
  onDeactivate?: () => void
  pinned?: boolean
}) {
  const isTotal = b.category_name === TOTAL_BUDGET
  return (
    <div className="card" style={{ padding: '16px 18px', ...(pinned ? { borderColor: 'var(--accent)' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        {!isTotal && <span style={{ width: 10, height: 10, borderRadius: 3, background: b.category_color ?? 'var(--ink-ghost)', flexShrink: 0 }} />}
        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{budgetLabel(b.category_name)}</span>
        {b.rollover && (
          <span className="badge" style={{ background: 'var(--bg-chip)', color: 'var(--ink-muted)' }}>↻ Rollover</span>
        )}
        {Math.abs(b.carry) >= 0.5 && (
          <span className="badge" style={{
            background: b.carry >= 0 ? 'rgba(63,122,85,0.14)' : 'rgba(190,74,51,0.12)',
            color: b.carry >= 0 ? 'var(--gain)' : 'var(--loss)',
          }}>
            {b.carry >= 0 ? '+' : '−'}{fmt(Math.abs(b.carry), currency)} carried
          </span>
        )}
        {b.orphaned && (
          <span className="badge" style={{ background: 'rgba(190,74,51,0.12)', color: 'var(--loss)' }}>Category missing</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '13px', color: 'var(--ink-soft)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {fmt(b.spent, currency)} / {fmt(b.effective, currency)}
          <span style={{ marginLeft: 8, fontWeight: 700, color: budgetBarColor(b.pct) }}>
            {b.pct === null || b.pct > 100 ? 'Over' : `${b.pct.toFixed(0)}%`}
          </span>
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: budgetBarWidth(b.pct), background: budgetBarColor(b.pct) }} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'flex-end' }}>
        {onReactivate && <button className="btn btn-secondary btn-sm" onClick={onReactivate}>Reactivate</button>}
        {onDeactivate && <button className="btn btn-secondary btn-sm" onClick={onDeactivate}>Deactivate</button>}
        <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        <button className="btn btn-danger btn-sm" onClick={onDelete}>Delete</button>
      </div>
    </div>
  )
}
