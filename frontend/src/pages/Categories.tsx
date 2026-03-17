import { useEffect, useState, useCallback } from 'react'
import { api, type Category, type CategoryIn, type KeywordRule, type KeywordRuleIn } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

const COLORS = ['#22c55e','#f97316','#a78bfa','#06b6d4','#64748b','#8b5cf6','#ef4444','#f59e0b','#ec4899','#84cc16','#3d8ef8','#10d98e','#94a3b8','#6b7280']
const FIELDS = ['any', 'description', 'reference']

const EMPTY_CAT: CategoryIn = { name: '', color: '#6b7280', is_income: false, is_transfer: false }
const EMPTY_RULE: KeywordRuleIn = { keyword: '', category_name: '', match_field: 'any', priority: 0 }

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules]           = useState<KeywordRule[]>([])
  const [loading, setLoading]       = useState(true)
  const [msg, setMsg]               = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [catForm, setCatForm]       = useState<CategoryIn>(EMPTY_CAT)
  const [editCat, setEditCat]       = useState<Category | null>(null)
  const [saving, setSaving]         = useState(false)

  const [ruleForm, setRuleForm]     = useState<KeywordRuleIn>(EMPTY_RULE)
  const [editRule, setEditRule]     = useState<KeywordRule | null>(null)
  const [reapplying, setReapplying] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [c, r] = await Promise.all([api.categories.list(), api.categories.rules.list()])
    setCategories(c)
    setRules(r)
    // Use functional update to only set the default category once (when form is still empty)
    if (c.length) setRuleForm(f => f.category_name ? f : { ...f, category_name: c[0].name })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  function flash(type: 'success' | 'error', text: string) { setMsg({ type, text }) }

  // ── Categories ──────────────────────────────────────────────────────────────

  async function saveCategory() {
    if (!catForm.name.trim()) return
    setSaving(true)
    try {
      if (editCat) {
        await api.categories.update(editCat.id, catForm)
        flash('success', 'Category updated.')
      } else {
        await api.categories.create(catForm)
        flash('success', 'Category created.')
      }
      setCatForm(EMPTY_CAT)
      setEditCat(null)
      await load()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category? Transactions assigned to it will have no category.')) return
    try {
      await api.categories.delete(id)
      flash('success', 'Category deleted.')
      await load()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
  }

  function startEditCat(c: Category) {
    setEditCat(c)
    setCatForm({ name: c.name, color: c.color, is_income: c.is_income, is_transfer: c.is_transfer })
  }

  // ── Keyword Rules ────────────────────────────────────────────────────────────

  async function saveRule() {
    if (!ruleForm.keyword.trim() || !ruleForm.category_name) return
    setSaving(true)
    try {
      if (editRule) {
        await api.categories.rules.update(editRule.id, ruleForm)
        flash('success', 'Rule updated.')
      } else {
        await api.categories.rules.create(ruleForm)
        flash('success', 'Rule created.')
      }
      setRuleForm({ ...EMPTY_RULE, category_name: ruleForm.category_name })
      setEditRule(null)
      await load()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function deleteRule(id: number) {
    try {
      await api.categories.rules.delete(id)
      flash('success', 'Rule deleted.')
      await load()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
  }

  function startEditRule(r: KeywordRule) {
    setEditRule(r)
    setRuleForm({ keyword: r.keyword, category_name: r.category_name, match_field: r.match_field, priority: r.priority })
  }

  async function reapply() {
    setReapplying(true)
    try {
      const res = await api.categories.rules.reapply()
      flash('success', `Re-applied rules: ${res.updated} transactions updated.`)
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setReapplying(false) }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <h1>Categories</h1>
        <p>Manage expense categories and keyword auto-classification rules</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {/* ── Category list + form ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem', marginBottom: '2rem' }}>
        <div>
          <div className="section-title">Categories</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Name</th><th>Type</th><th></th></tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.color, display: 'inline-block', flexShrink: 0 }} />
                        {c.name}
                      </span>
                    </td>
                    <td>
                      {c.is_income && <span className="badge" style={{ background: 'rgba(16,217,142,0.15)', color: '#10d98e', marginRight: 4 }}>Income</span>}
                      {c.is_transfer && <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>Transfer</span>}
                      {!c.is_income && !c.is_transfer && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Expense</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditCat(c)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="section-title" style={{ marginBottom: '0.75rem' }}>
            {editCat ? 'Edit Category' : 'New Category'}
          </div>
          <div className="form-group">
            <label>Name</label>
            <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Color</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLORS.map(col => (
                <button
                  key={col}
                  onClick={() => setCatForm(f => ({ ...f, color: col }))}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: col, border: 'none', cursor: 'pointer',
                    outline: catForm.color === col ? `2px solid white` : 'none',
                    outlineOffset: 2,
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={catForm.is_income} onChange={e => setCatForm(f => ({ ...f, is_income: e.target.checked }))} style={{ width: 'auto' }} />
              Income
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input type="checkbox" checked={catForm.is_transfer} onChange={e => setCatForm(f => ({ ...f, is_transfer: e.target.checked }))} style={{ width: 'auto' }} />
              Transfer
            </label>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={saveCategory} disabled={saving}>
              {editCat ? 'Update' : 'Create'}
            </button>
            {editCat && <button className="btn btn-secondary btn-sm" onClick={() => { setEditCat(null); setCatForm(EMPTY_CAT) }}>Cancel</button>}
          </div>
        </div>
      </div>

      {/* ── Keyword rules ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="section-title" style={{ margin: 0 }}>Keyword Rules</div>
        <button className="btn btn-secondary btn-sm" onClick={reapply} disabled={reapplying}>
          {reapplying ? 'Re-applying…' : '↺ Re-apply to all transactions'}
        </button>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        When a transaction's description or reference contains the keyword (case-insensitive), it is assigned to the category.
        Higher priority rules win.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '1.5rem' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Keyword</th><th>Category</th><th>Field</th><th>Priority</th><th></th></tr>
            </thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: '0.8rem' }}>{r.keyword}</code></td>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: categories.find(c => c.name === r.category_name)?.color ?? '#6b7280', display: 'inline-block' }} />
                      {r.category_name}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.match_field}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.priority}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditRule(r)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRule(r.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>No rules yet</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="section-title" style={{ marginBottom: '0.75rem' }}>
            {editRule ? 'Edit Rule' : 'New Rule'}
          </div>
          <div className="form-group">
            <label>Keyword</label>
            <input
              value={ruleForm.keyword}
              onChange={e => setRuleForm(f => ({ ...f, keyword: e.target.value }))}
              placeholder="e.g. amazon"
            />
          </div>
          <div className="form-group">
            <label>Category</label>
            <select value={ruleForm.category_name} onChange={e => setRuleForm(f => ({ ...f, category_name: e.target.value }))}>
              {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Match Field</label>
            <select value={ruleForm.match_field} onChange={e => setRuleForm(f => ({ ...f, match_field: e.target.value }))}>
              {FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Priority (higher = wins)</label>
            <input
              type="number" min={0}
              value={ruleForm.priority}
              onChange={e => setRuleForm(f => ({ ...f, priority: Number(e.target.value) }))}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-primary btn-sm" onClick={saveRule} disabled={saving}>
              {editRule ? 'Update' : 'Create'}
            </button>
            {editRule && <button className="btn btn-secondary btn-sm" onClick={() => { setEditRule(null); setRuleForm(EMPTY_RULE) }}>Cancel</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
