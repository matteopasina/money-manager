import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type BalanceRow, type Account, type FxRate } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { fmtAmount } from '../components/MoneyChart'

type SortKey = 'date' | 'account' | 'amount_native' | 'amount_base'

export default function Balances() {
  const navigate = useNavigate()
  const [rows, setRows]           = useState<BalanceRow[]>([])
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [fxRates, setFxRates]     = useState<FxRate[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterAccount, setFilterAccount] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editVals, setEditVals]   = useState({ amount_native: '', amount_base: '' })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [sortKey, setSortKey]     = useState<SortKey>('date')
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc')

  const [showAddForm, setShowAddForm] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const [addForm, setAddForm] = useState({
    account_id: '',
    date: today,
    amount_native: '',
    amount_base: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    const [b, a, fx] = await Promise.all([api.balances.list(), api.accounts.list(true), api.accounts.fxRates()])
    setRows(b)
    setAccounts(a)
    setFxRates(fx)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const selectedAddAccount = accounts.find(a => String(a.id) === addForm.account_id)

  function getRate(currency: string): number {
    if (currency === 'EUR') return 1
    const r = fxRates.find(f => f.currency === currency)
    return r?.rate_to_base ?? 1
  }

  function onAddAmountNativeChange(value: string) {
    const native = parseFloat(value)
    if (!isNaN(native) && selectedAddAccount) {
      const rate = getRate(selectedAddAccount.currency)
      setAddForm(f => ({ ...f, amount_native: value, amount_base: (native * rate).toFixed(2) }))
    } else {
      setAddForm(f => ({ ...f, amount_native: value }))
    }
  }

  function onAddAccountChange(id: string) {
    const acct = accounts.find(a => String(a.id) === id)
    setAddForm(f => {
      const native = parseFloat(f.amount_native)
      const base = acct && !isNaN(native) ? (native * getRate(acct.currency)).toFixed(2) : f.amount_base
      return { ...f, account_id: id, amount_base: base }
    })
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addForm.account_id || !addForm.date || !addForm.amount_native) return
    setSaving(true)
    setMsg(null)
    try {
      await api.balances.create({
        account_id: Number(addForm.account_id),
        date: addForm.date,
        amount_native: parseFloat(addForm.amount_native),
        amount_base: parseFloat(addForm.amount_base) || parseFloat(addForm.amount_native),
      })
      setMsg({ type: 'success', text: 'Balance recorded.' })
      setAddForm(f => ({ ...f, amount_native: '', amount_base: '' }))
      await load()
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
      await load()
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
      await load()
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

  const isAddNonBase = selectedAddAccount && selectedAddAccount.currency !== 'EUR'

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Balances</h1>
          <p>Record and review balance snapshots for each account</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary" onClick={() => navigate('/import')}>↥ Import instead</button>
          <button className="btn btn-primary" onClick={() => setShowAddForm(s => !s)}>
            {showAddForm ? 'Cancel' : '+ Add balance'}
          </button>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      {showAddForm && (
        <div className="card" style={{ marginBottom: '1.25rem' }}>
          <div className="section-title" style={{ fontSize: '1rem', marginBottom: '1rem' }}>Record a balance</div>
          <form onSubmit={submitAdd}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: '0.9rem', alignItems: 'end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Account</label>
                <select value={addForm.account_id} onChange={e => onAddAccountChange(e.target.value)} required>
                  <option value="">Select account…</option>
                  {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Date</label>
                <input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Amount {selectedAddAccount ? `(${selectedAddAccount.currency})` : ''}</label>
                <input
                  type="number" step="0.01" placeholder="0.00"
                  value={addForm.amount_native}
                  onChange={e => onAddAmountNativeChange(e.target.value)}
                  required
                />
              </div>
            </div>

            {isAddNonBase && (
              <div className="form-group" style={{ maxWidth: 340, marginTop: '0.9rem' }}>
                <label>
                  Amount in base currency (EUR)
                  {fxRates.find(f => f.currency === selectedAddAccount.currency) && (
                    <span style={{ color: 'var(--ink-faint)', fontWeight: 400, marginLeft: 8 }}>
                      · rate 1 {selectedAddAccount.currency} = {getRate(selectedAddAccount.currency)} EUR
                    </span>
                  )}
                </label>
                <input
                  type="number" step="0.01" placeholder="0.00"
                  value={addForm.amount_base}
                  onChange={e => setAddForm(f => ({ ...f, amount_base: e.target.value }))}
                />
              </div>
            )}

            <button className="btn btn-primary" type="submit" disabled={saving} style={{ marginTop: '1.1rem' }}>
              {saving ? 'Saving…' : 'Record Balance'}
            </button>
          </form>
        </div>
      )}

      <div style={{ marginBottom: '1rem', maxWidth: 300 }}>
        <label className="metric-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Filter by account</label>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {([
                ['date', 'Date', 'left'],
                ['account', 'Account', 'left'],
                [null, 'Currency', 'left'],
                ['amount_native', 'Amount (native)', 'right'],
                ['amount_base', 'Amount (base)', 'right'],
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
                        <button className="btn btn-danger btn-sm" onClick={() => deleteRow(r.id)} disabled={saving}>Delete</button>
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
