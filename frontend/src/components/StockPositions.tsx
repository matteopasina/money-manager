import { useState } from 'react'
import { api, type Account } from '../api/client'
import { useApi } from '../hooks/useApi'
import Alert from './Alert'
import { fmt } from '../utils/money'

export default function StockPositions({ accounts }: { accounts: Account[] }) {
  const { data, error, reload } = useApi(() => api.stockPositions.list(), [])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [accountId, setAccountId] = useState('')
  const [quantity, setQuantity] = useState('')

  async function run(action: () => Promise<unknown>) {
    setBusy(true); setFailure(null); setMessage(null)
    try { await action(); reload(); setMessage('Salvato. Valori aggiornati.') }
    catch (e) { setFailure(e instanceof Error ? e.message : String(e)); reload() }
    finally { setBusy(false) }
  }
  async function save(id: number, raw: string) {
    const number = Number(raw.replace(',', '.'))
    if (!raw.trim() || !Number.isFinite(number) || number < 0) throw new Error('Inserisci una quantità valida di azioni.')
    await api.stockPositions.save(id, number)
    await api.stockPositions.sync()
  }
  return <section className="card" aria-labelledby="stock-positions-heading" style={{ marginBottom: '2rem' }}>
    <div className="dashboard-section-header">
      <div><h2 id="stock-positions-heading">Azioni Microsoft</h2><p>Valore delle azioni MSFT · esclusi liquidità e titoli non ancora maturati</p></div>
      <button className="btn btn-secondary" disabled={busy || !data?.length} onClick={() => run(() => api.stockPositions.sync())}>{busy ? 'Aggiornamento…' : 'Aggiorna valori'}</button>
    </div>
    {(error || failure) && <Alert type="error">{failure || error}</Alert>}
    {message && <Alert type="success">{message}</Alert>}
    {data?.map(position => <div key={position.account_id} style={{ borderTop: '1px solid var(--border)', padding: '1rem 0' }}>
      <strong>{position.account}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
        <label>Azioni MSFT <input style={{ width: 140 }} inputMode="decimal" value={drafts[position.account_id] ?? String(position.quantity)} onChange={e => setDrafts(d => ({ ...d, [position.account_id]: e.target.value }))} /></label>
        <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => save(position.account_id, drafts[position.account_id] ?? String(position.quantity)))}>Salva e aggiorna</button>
        {position.valuation && <strong>{fmt(position.valuation.amount_base, position.valuation.base_currency)}</strong>}
      </div>
      {position.valuation ? <p className="dashboard-chart-note">
        MSFT {fmt(position.valuation.price_usd, 'USD', { decimals: 2 })} · Quotazione: {new Date(position.valuation.quoted_at).toLocaleString()}<br />
        1 USD = {position.valuation.usd_to_base} {position.valuation.base_currency} · Data cambio: {position.valuation.fx_date}<br />
        Controllato: {new Date(position.valuation.updated_at).toLocaleString()} · {position.valuation.source}
      </p> : <p>Quantità salvata; valorizzazione in attesa. Aggiorna per registrare il valore nel saldo del conto.</p>}
    </div>)}
    <details><summary>Registra azioni MSFT in un altro conto</summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginTop: '1rem' }}>
        <label>Conto <select value={accountId} onChange={e => setAccountId(e.target.value)}><option value="">Scegli un conto</option>{accounts.filter(a => a.active && a.account_type === 'stocks' && !data?.some(p => p.account_id === a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Azioni <input inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
        <button className="btn btn-primary" disabled={busy || !accountId || !quantity} onClick={() => run(() => save(Number(accountId), quantity))}>Registra e aggiorna</button>
      </div>
    </details>
    <p className="dashboard-chart-note">Gli aggiornamenti seguono le impostazioni di sincronizzazione mentre l’app è in esecuzione. Le quotazioni possono essere ritardate. Aggiorna le quantità dopo acquisti, vendite o maturazioni. Questa valorizzazione sostituisce il saldo corrente del conto associato.</p>
  </section>
}
