import { useEffect, useState } from 'react'
import { api, type Account, type FxRate } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

export default function AddBalance() {
  const [accounts, setAccounts]     = useState<Account[]>([])
  const [fxRates, setFxRates]       = useState<FxRate[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [msg, setMsg]               = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    account_id: '',
    date: today,
    amount_native: '',
    amount_base: '',
  })

  useEffect(() => {
    Promise.all([api.accounts.list(true), api.accounts.fxRates()])
      .then(([a, fx]) => { setAccounts(a); setFxRates(fx) })
      .finally(() => setLoading(false))
  }, [])

  const selectedAccount = accounts.find(a => String(a.id) === form.account_id)

  function getRate(currency: string): number {
    if (currency === 'EUR') return 1
    const r = fxRates.find(f => f.currency === currency)
    return r?.rate_to_base ?? 1
  }

  function onAmountNativeChange(value: string) {
    const native = parseFloat(value)
    if (!isNaN(native) && selectedAccount) {
      const rate = getRate(selectedAccount.currency)
      setForm(f => ({ ...f, amount_native: value, amount_base: (native * rate).toFixed(2) }))
    } else {
      setForm(f => ({ ...f, amount_native: value }))
    }
  }

  function onAccountChange(id: string) {
    const acct = accounts.find(a => String(a.id) === id)
    setForm(f => {
      const native = parseFloat(f.amount_native)
      const base = acct && !isNaN(native) ? (native * getRate(acct.currency)).toFixed(2) : f.amount_base
      return { ...f, account_id: id, amount_base: base }
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.account_id || !form.date || !form.amount_native) return
    setSaving(true)
    setMsg(null)
    try {
      await api.balances.create({
        account_id: Number(form.account_id),
        date: form.date,
        amount_native: parseFloat(form.amount_native),
        amount_base: parseFloat(form.amount_base) || parseFloat(form.amount_native),
      })
      setMsg({ type: 'success', text: 'Balance recorded.' })
      setForm(f => ({ ...f, amount_native: '', amount_base: '' }))
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const isNonBase = selectedAccount && selectedAccount.currency !== 'EUR'

  return (
    <div>
      <div className="page-header">
        <h1>Add Balance</h1>
        <p>Record the current balance for an account</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="card" style={{ maxWidth: 520 }}>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Account</label>
            <select value={form.account_id} onChange={e => onAccountChange(e.target.value)} required>
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Date</label>
            <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required />
          </div>

          <div className="form-group">
            <label>
              Amount {selectedAccount ? `(${selectedAccount.currency})` : ''}
            </label>
            <input
              type="number" step="0.01" placeholder="0.00"
              value={form.amount_native}
              onChange={e => onAmountNativeChange(e.target.value)}
              required
            />
          </div>

          {isNonBase && (
            <div className="form-group">
              <label>
                Amount in Base Currency (EUR)
                {fxRates.find(f => f.currency === selectedAccount.currency) && (
                  <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 8 }}>
                    Rate: 1 {selectedAccount.currency} = {getRate(selectedAccount.currency)} EUR
                  </span>
                )}
              </label>
              <input
                type="number" step="0.01" placeholder="0.00"
                value={form.amount_base}
                onChange={e => setForm(f => ({ ...f, amount_base: e.target.value }))}
              />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                Auto-filled from FX rate. Override if needed.
              </p>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Record Balance'}
          </button>
        </form>
      </div>

      {accounts.length === 0 && (
        <Alert type="info" style={{ marginTop: '1rem', maxWidth: 520 }}>
          No active accounts found. Create one in <strong>Accounts & FX</strong> first.
        </Alert>
      )}
    </div>
  )
}
