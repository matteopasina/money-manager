import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, type Account } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { CURRENCIES, ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from '../constants'
import { useApi } from '../hooks/useApi'

export default function Accounts({ mode = 'accounts', embedded = false, onAccountsChange }: { mode?: 'accounts' | 'currencies'; embedded?: boolean; onAccountsChange?: () => void }) {
  const [showForm, setShowForm] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [form, setForm] = useState({ name: '', currency: '', account_type: 'liquid' })
  const { data, loading, error, reload } = useApi(() => Promise.all([api.accounts.list(), api.accounts.fxRates(), api.settings.all()]), [])
  const Heading = embedded ? 'h2' : 'h1'
  if (loading) return <LoadingSpinner />
  if (error || !data) return <Alert type="error">Impossibile caricare i conti: {error}<button className="btn-link" onClick={reload}>Riprova</button></Alert>
  const [accounts, fxRates, settings] = data
  const currency = settings.base_currency ?? 'EUR'
  const currencies = [...new Set(accounts.map(a => a.currency))].filter(c => c !== currency)

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true); setMsg(null)
    try { await action(); setMsg({ type: 'success', text: success }); reload(); onAccountsChange?.() }
    catch (e) { setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) }) }
    finally { setSaving(false) }
  }
  async function create() {
    if (!form.name.trim()) return
    await run(async () => {
      await api.accounts.create({ ...form, name: form.name.trim(), currency: form.currency || currency })
      setForm({ name: '', currency: '', account_type: 'liquid' }); setShowForm(false)
    }, 'Conto creato.')
  }
  function toggle(a: Account) { void run(() => api.accounts.update(a.id, { active: !a.active }), 'Conto aggiornato.') }

  return <section>
    <div className="page-header"><div><Heading>{mode === 'currencies' ? 'Valute e cambi' : 'I tuoi conti'}</Heading><p>{mode === 'currencies' ? `Valuta di riferimento: ${currency}. I cambi sono gestiti manualmente.` : 'Gestisci i conti e aggiorna i saldi qui sotto.'}</p></div>
      {mode === 'accounts' && <button className="btn btn-secondary" onClick={() => setShowForm(v => !v)}>{showForm ? 'Annulla' : '+ Nuovo conto'}</button>}
    </div>
    {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}
    {mode === 'accounts' ? <>
      {showForm && <form className="card workspace-form" onSubmit={e => { e.preventDefault(); void create() }}>
        <label>Nome del conto<input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Es. Conto principale" /></label>
        <label>Valuta<select value={form.currency || currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
        <label>Tipo<select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t] ?? t}</option>)}</select></label>
        <button className="btn btn-primary" disabled={saving}>Crea conto</button>
      </form>}
      <div className="table-wrap"><table><thead><tr><th>Nome</th><th>Valuta</th><th>Tipo</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>
        {accounts.map(a => <tr key={a.id}><td>{a.name}</td><td>{a.currency}</td><td>{ACCOUNT_TYPE_LABELS[a.account_type] ?? a.account_type}</td><td>{a.active ? 'Attivo' : 'Inattivo'}</td><td><button className="btn btn-secondary btn-sm" disabled={saving} onClick={() => toggle(a)}>{a.active ? 'Disattiva' : 'Attiva'}</button> <Link className="btn-link" to={`/import?type=balances&account_id=${a.id}`}>Importa saldi</Link></td></tr>)}
        {!accounts.length && <tr><td colSpan={5}>Nessun conto. Aggiungi il primo per iniziare.</td></tr>}
      </tbody></table></div>
      <p className="workspace-note">Per i conti in altre valute, <Link to="/settings/currencies">gestisci i tassi di cambio →</Link></p>
    </> : <div className="card">
      <p>Indica quante unità di {currency} vale 1 unità di valuta estera. Le modifiche saranno usate per le successive conversioni.</p>
      {currencies.map(c => {
        const value = drafts[c] ?? String(fxRates.find(r => r.currency === c)?.rate_to_base ?? '')
        return <form className="currency-row" key={c} onSubmit={e => { e.preventDefault(); const rate = Number(value); if (Number.isFinite(rate) && rate > 0) void run(() => api.accounts.upsertFxRate(c, rate), `Cambio ${c} salvato.`) }}>
          <label>1 {c} = <input aria-label={`Cambio ${c} in ${currency}`} type="number" min="0.00000001" step="any" required value={value} onChange={e => setDrafts(d => ({ ...d, [c]: e.target.value }))} /> {currency}</label>
          <button className="btn btn-secondary" disabled={saving}>Salva cambio</button>
        </form>
      })}
      {!currencies.length && <p className="workspace-note">Tutti i conti sono in {currency}: non serve impostare altri cambi.</p>}
    </div>}
  </section>
}
