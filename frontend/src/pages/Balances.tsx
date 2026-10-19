import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { fmtAmount } from '../utils/money'
import { todayLocal } from '../utils/date'
import { useApi } from '../hooks/useApi'

type SortKey = 'date' | 'account' | 'amount_native' | 'amount_base'

export default function Balances({ embedded = false, accountsVersion = 0 }: { embedded?: boolean; accountsVersion?: number }) {
  const Heading = embedded ? 'h2' : 'h1'
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [filterAccount, setFilterAccount] = useState(searchParams.get('account_id') ?? '')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editVals, setEditVals]   = useState({ amount_native: '', amount_base: '' })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sortKey, setSortKey]     = useState<SortKey>('date')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  const [showAddForm, setShowAddForm] = useState(searchParams.get('action') === 'add')
  const [addForm, setAddForm] = useState({
    account_id: searchParams.get('account_id') ?? '',
    date: todayLocal(),
    amount_native: '',
    amount_base: '',
  })

  const { data: loaded, loading, error, reload } = useApi(
    () => Promise.all([
      api.balances.list(), api.accounts.list(true), api.accounts.fxRates(), api.settings.all(),
    ]),
    [accountsVersion],
  )
  const rows = useMemo(() => loaded?.[0] ?? [], [loaded])
  const accounts = useMemo(() => loaded?.[1] ?? [], [loaded])
  const fxRates = useMemo(() => loaded?.[2] ?? [], [loaded])
  const baseCurrency = loaded ? (loaded[3].base_currency ?? 'EUR') : 'EUR'

  const selectedAddAccount = accounts.find(a => String(a.id) === addForm.account_id)

  // null means "no FX rate on file" — callers must not silently treat that as 1:1.
  function getRate(currency: string): number | null {
    if (currency === baseCurrency) return 1
    const r = fxRates.find(f => f.currency === currency)
    return r?.rate_to_base ?? null
  }

  function onAddAmountNativeChange(value: string) {
    const native = parseFloat(value)
    if (!isNaN(native) && selectedAddAccount) {
      const rate = getRate(selectedAddAccount.currency)
      setAddForm(f => ({ ...f, amount_native: value, amount_base: rate === null ? '' : (native * rate).toFixed(2) }))
    } else {
      setAddForm(f => ({ ...f, amount_native: value }))
    }
  }

  function onAddAccountChange(id: string) {
    const acct = accounts.find(a => String(a.id) === id)
    setAddForm(f => {
      const native = parseFloat(f.amount_native)
      if (!acct || isNaN(native)) return { ...f, account_id: id }
      const rate = getRate(acct.currency)
      return { ...f, account_id: id, amount_base: rate === null ? '' : (native * rate).toFixed(2) }
    })
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.account_id || !addForm.date || !addForm.amount_native) return
    if (isAddNonBase && !addForm.amount_base) {
      setMsg({ type: 'error', text: `Nessun cambio registrato per ${selectedAddAccount?.currency}. Set one on the Accounts & FX page, oppure inserisci ${baseCurrency} amount manually above.` })
      return
    }
    setSaving(true)
    setMsg(null)
    try {
      await api.balances.create({
        account_id: Number(addForm.account_id),
        date: addForm.date,
        amount_native: parseFloat(addForm.amount_native),
        amount_base: isAddNonBase ? parseFloat(addForm.amount_base) : parseFloat(addForm.amount_native),
      })
      setMsg({ type: 'success', text: 'Balance recorded.' })
      setAddForm(f => ({ ...f, amount_native: '', amount_base: '' }))
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function saveEdit(id: number) {
    const native = parseFloat(editVals.amount_native)
    const base   = parseFloat(editVals.amount_base)
    if (isNaN(native) || isNaN(base)) return
    setSaving(true)
    try {
      await api.balances.update(id, { amount_native: native, amount_base: base })
      setEditingId(null)
      setMsg({ type: 'success', text: 'Balance updated.' })
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function deleteRow(id: number) {
    if (!confirm('Delete this balance entry?')) return
    setSaving(true)
    try {
      await api.balances.delete(id)
      setMsg({ type: 'success', text: 'Balance deleted.' })
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  const visible = useMemo(() => {
    const filtered = filterAccount
      ? rows.filter(r => String(r.account_id) === filterAccount)
      : rows
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'date')         cmp = a.date.localeCompare(b.date)
      else if (sortKey === 'account') cmp = a.account.localeCompare(b.account)
      else if (sortKey === 'amount_native') cmp = a.amount_native - b.amount_native
      else if (sortKey === 'amount_base')   cmp = a.amount_base - b.amount_base
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, filterAccount, sortKey, sortDir])

  const isAddNonBase = Boolean(selectedAddAccount) && selectedAddAccount!.currency !== baseCurrency
  const missingRate = isAddNonBase && getRate(selectedAddAccount!.currency) === null

  if (loading) return <LoadingSpinner />

  if (error) return (
    <div>
      <div className="page-header"><Heading>Saldi registrati</Heading></div>
      <Alert type="error">Impossibile caricare i saldi: {error}</Alert>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <Heading>Saldi registrati</Heading>
          <p>Aggiungi e controlla i saldi dei tuoi conti</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/import?type=balances')}>↥ Importa saldi</button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(s => !s)}>
            {showAddForm ? 'Annulla' : '+ Aggiungi saldo'}
          </button>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {showAddForm && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>Registra un saldo</div>
          <form onSubmit={submitAdd}>
            <div className="balance-form-grid">
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="balance-account">Conto</label>
                <select id="balance-account" value={addForm.account_id} onChange={e => onAddAccountChange(e.target.value)} required>
                  <option value="">Seleziona un conto…</option>
                  {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="balance-date">Data</label>
                <input id="balance-date" type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="balance-native">Importo {selectedAddAccount ? `(${selectedAddAccount.currency})` : ''}</label>
                <input
                  id="balance-native" type="number" step="0.01" placeholder="0.00"
                  value={addForm.amount_native}
                  onChange={e => onAddAmountNativeChange(e.target.value)}
                  required
                />
              </div>
            </div>

            {isAddNonBase && (
              <div className="form-group" style={{ maxWidth: 340, marginTop: '0.9rem' }}>
                <label>
                  Importo nella valuta di riferimento ({baseCurrency})
                  {!missingRate && (
                    <span style={{ color: 'var(--ink-faint)', fontWeight: 400, marginLeft: 8 }}>
                      · rate 1 {selectedAddAccount!.currency} = {getRate(selectedAddAccount!.currency)} {baseCurrency}
                    </span>
                  )}
                </label>
                <input
                  type="number" step="0.01" placeholder="0.00"
                  value={addForm.amount_base}
                  onChange={e => setAddForm(f => ({ ...f, amount_base: e.target.value }))}
                />
                {missingRate && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--loss)', marginTop: 4 }}>
                    Nessun cambio registrato per {selectedAddAccount!.currency}. <a href="/settings/currencies" onClick={e => { e.preventDefault(); navigate('/settings/currencies') }}>Impostalo in Valute e cambi</a>, oppure inserisci {baseCurrency} qui sopra.
                  </p>
                )}
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={saving || (missingRate && !addForm.amount_base)} style={{ marginTop: '1.1rem' }}>
              {saving ? 'Salvataggio…' : 'Registra saldo'}
            </button>
          </form>
        </div>
      )}

      <div style={{ marginBottom: '1rem', maxWidth: 300 }}>
        <label className="metric-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Filtra per conto</label>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="">Tutti i conti</option>
          {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {([
                ['date', 'Data', 'left'],
                ['account', 'Conto', 'left'],
                [null, 'Valuta', 'left'],
                ['amount_native', 'Importo originale', 'right'],
                ['amount_base', 'Importo convertito', 'right'],
              ] as [SortKey | null, string, string][]).map(([key, label, align]) => (
                <th
                  key={label}
                  style={{ textAlign: align as 'left' | 'right', cursor: key ? 'pointer' : undefined, userSelect: 'none', whiteSpace: 'nowrap' }}
                  onClick={() => key && toggleSort(key)}
                >
                  {label}{key && sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(r => (
              <tr key={r.id}>
                <td style={{ whiteSpace: 'nowrap', fontSize: '0.78rem' }}>{r.date}</td>
                <td>{r.account}</td>
                <td><span className="badge" style={{ background: 'rgba(61,142,248,0.15)', color: '#3d8ef8' }}>{r.currency}</span></td>

                {editingId === r.id ? (
                  <>
                    <td>
                      <input
                        type="number" step="0.01"
                        value={editVals.amount_native}
                        onChange={e => setEditVals(v => ({ ...v, amount_native: e.target.value }))}
                        style={{ width: 120, textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <input
                        type="number" step="0.01"
                        value={editVals.amount_base}
                        onChange={e => setEditVals(v => ({ ...v, amount_base: e.target.value }))}
                        style={{ width: 120, textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => saveEdit(r.id)} disabled={saving}>✓</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => setEditingId(null)}>✕</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_native)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_base)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => { setEditingId(r.id); setEditVals({ amount_native: String(r.amount_native), amount_base: String(r.amount_base) }) }}
                        >
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => deleteRow(r.id)} disabled={saving}>Elimina</button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {!visible.length && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-faint)', padding: '2rem' }}>No entries</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
