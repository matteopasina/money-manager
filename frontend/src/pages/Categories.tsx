import { useEffect, useMemo, useState } from 'react'
import { api, type Category, type CategoryIn, type KeywordRule, type KeywordRuleIn } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { useApi } from '../hooks/useApi'

// Matches the warm "Meridian" palette used throughout the app's charts
// (MoneyChart.tsx's ACCOUNT_PALETTE) and the backend's DEFAULT_CATEGORIES.
const COLORS = ['#B8842B','#3F7A55','#6E5A3E','#A88B5C','#C97B4A','#8C9A6B','#9A6B4A','#7A8C6B','#B0915C','#5C7A6E','#D4A24C','#4A6741','#8B6F47','#B0745C']
const FIELDS = ['any', 'description', 'reference']

const EMPTY_CAT: CategoryIn = { name: '', color: '#B0745C', is_income: false, is_transfer: false }
const EMPTY_RULE: KeywordRuleIn = { keyword: '', category_name: '', match_field: 'any', priority: 0 }

export default function Categories({ embedded = false }: { embedded?: boolean }) {
  const Heading = embedded ? 'h2' : 'h1'
  const [msg, setMsg]               = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [catForm, setCatForm]       = useState<CategoryIn>(EMPTY_CAT)
  const [editCat, setEditCat]       = useState<Category | null>(null)
  const [saving, setSaving]         = useState(false)

  const [ruleForm, setRuleForm]     = useState<KeywordRuleIn>(EMPTY_RULE)
  const [editRule, setEditRule]     = useState<KeywordRule | null>(null)
  const [reapplying, setReapplying] = useState(false)
  const [seeding, setSeeding]       = useState(false)

  const { data: loaded, loading, error, reload } = useApi(
    () => Promise.all([api.categories.list(), api.categories.rules.list()]),
    [],
  )
  const categories = useMemo(() => loaded?.[0] ?? [], [loaded])
  const rules = loaded ? loaded[1] : []

  // Default the new-rule form to the first category once, when categories load.
  useEffect(() => {
    if (categories.length) setRuleForm(f => f.category_name ? f : { ...f, category_name: categories[0].name })
  }, [categories])

  function flash(type: 'success' | 'error', text: string) { setMsg({ type, text }) }

  // ── Categories ──────────────────────────────────────────────────────────────

  async function saveCategory() {
    if (!catForm.name.trim()) return
    setSaving(true)
    try {
      if (editCat) {
        await api.categories.update(editCat.id, catForm)
        flash('success', 'Categoria aggiornata.')
      } else {
        await api.categories.create(catForm)
        flash('success', 'Categoria creata.')
      }
      setCatForm(EMPTY_CAT)
      setEditCat(null)
      reload()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function deleteCategory(id: number) {
    if (!confirm('Delete this category? Transactions assigned to it will have no category.')) return
    try {
      await api.categories.delete(id)
      flash('success', 'Categoria eliminata.')
      reload()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
  }

  function startEditCat(c: Category) {
    setEditCat(c)
    setCatForm({ name: c.name, color: c.color, is_income: c.is_income, is_transfer: c.is_transfer })
  }

  // ── Regole di classificazione ────────────────────────────────────────────────────────────

  async function saveRule() {
    if (!ruleForm.keyword.trim() || !ruleForm.category_name) return
    setSaving(true)
    try {
      if (editRule) {
        await api.categories.rules.update(editRule.id, ruleForm)
        flash('success', 'Regola aggiornata.')
      } else {
        await api.categories.rules.create(ruleForm)
        flash('success', 'Regola creata.')
      }
      setRuleForm({ ...EMPTY_RULE, category_name: ruleForm.category_name })
      setEditRule(null)
      reload()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setSaving(false) }
  }

  async function deleteRule(id: number) {
    try {
      await api.categories.rules.delete(id)
      flash('success', 'Regola eliminata.')
      reload()
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
      flash('success', `Applied matching rules: ${res.updated} transactions changed. Unmatched categories were preserved.`)
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setReapplying(false) }
  }

  async function seedDefaults() {
    setSeeding(true)
    try {
      const res = await api.categories.rules.seedDefaults()
      flash('success', `Smart defaults added: ${res.inserted} new rules (${res.skipped} already existed).`)
      reload()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
    finally { setSeeding(false) }
  }

  async function resetColors() {
    if (!confirm('Reset built-in categories (Groceries, Food, Income, etc.) to the app\'s default colours? Custom categories are left alone.')) return
    try {
      const res = await api.categories.resetColors()
      flash('success', `Reset ${res.updated} categor${res.updated === 1 ? 'y' : 'ies'} to the default palette.`)
      reload()
    } catch (e: unknown) { flash('error', e instanceof Error ? e.message : String(e)) }
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      {!embedded && <div className="page-header"><Heading>Categorie e regole</Heading><p>Organizza le categorie e automatizza la classificazione dei movimenti</p></div>}

      {error && <Alert type="error">Impossibile caricare le categorie: {error}</Alert>}
      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {/* ── Category list + form ── */}
      <div className="category-workspace">
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <div className="section-title" style={{ margin: 0 }}>Categorie</div>
            <button className="btn btn-secondary btn-sm" onClick={resetColors}>Ripristina colori</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nome</th><th>Tipo</th><th></th></tr>
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
                      {c.is_income && <span className="badge" style={{ background: 'rgba(16,217,142,0.15)', color: '#10d98e', marginRight: 4 }}>Entrata</span>}
                      {c.is_transfer && <span className="badge" style={{ background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>Trasferimento</span>}
                      {!c.is_income && !c.is_transfer && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Spesa</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => startEditCat(c)}>Modifica</button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteCategory(c.id)}>Elimina</button>
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
            {editCat ? 'Modifica categoria' : 'Nuova categoria'}
          </div>
          <div className="form-group">
            <label>Nome</label>
            <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>Colore</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {COLORS.map(col => (
                <button
                  key={col}
                  aria-label={`Colore ${col}`}
                  aria-pressed={catForm.color === col}
                  onClick={() => setCatForm(f => ({ ...f, color: col }))}
                  style={{
                    width: 24, height: 24, borderRadius: '50%', background: col, border: 'none', cursor: 'pointer',
                    outline: catForm.color === col ? '2px solid var(--ink)' : undefined,
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
              {editCat ? 'Aggiorna' : 'Crea'}
            </button>
            {editCat && <button className="btn btn-secondary btn-sm" onClick={() => { setEditCat(null); setCatForm(EMPTY_CAT) }}>Annulla</button>}
          </div>
        </div>
      </div>

      {/* ── Regole di classificazione ── */}
      <div className="category-rule-toolbar">
        <div className="section-title" style={{ margin: 0 }}>Regole di classificazione</div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={seedDefaults} disabled={seeding}>
            {seeding ? 'Aggiunta…' : '✦ Aggiungi regole suggerite'}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={reapply} disabled={reapplying}>
            {reapplying ? 'Applicazione…' : '↺ Applica ai movimenti'}
          </button>
        </div>
      </div>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Se la descrizione o il riferimento contiene la parola chiave, il movimento viene assegnato alla categoria. Maiuscole e minuscole non fanno differenza.
        Le regole con priorità maggiore prevalgono. Gli altri movimenti mantengono la categoria attuale.
      </p>

      <div className="category-workspace">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Parola chiave</th><th>Categoria</th><th>Campo</th><th>Priorità</th><th></th></tr>
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
                      <button className="btn btn-secondary btn-sm" onClick={() => startEditRule(r)}>Modifica</button>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRule(r.id)}>Elimina</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rules.length && (
                <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Nessuna regola</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card" style={{ alignSelf: 'start' }}>
          <div className="section-title" style={{ marginBottom: '0.75rem' }}>
            {editRule ? 'Modifica regola' : 'Nuova regola'}
          </div>
          <div className="form-group">
            <label>Parola chiave</label>
            <input
              value={ruleForm.keyword}
              onChange={e => setRuleForm(f => ({ ...f, keyword: e.target.value }))}
              placeholder="Es. amazon"
            />
          </div>
          <div className="form-group">
            <label>Categoria</label>
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
              {editRule ? 'Aggiorna' : 'Crea'}
            </button>
            {editRule && <button className="btn btn-secondary btn-sm" onClick={() => { setEditRule(null); setRuleForm(EMPTY_RULE) }}>Annulla</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
