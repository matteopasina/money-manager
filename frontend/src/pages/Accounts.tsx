import { useEffect, useMemo, useState } from 'react'
import { api, type Account } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { CURRENCIES, ACCOUNT_TYPES } from '../constants'
import { useApi } from '../hooks/useApi'

export default function Accounts() {
  const [showForm, setShowForm]   = useState(false)
  const [editFx, setEditFx]       = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [form, setForm] = useState({ name: '', currency: 'EUR', account_type: 'liquid' })

  const { data: loaded, loading, error, reload } = useApi(
    () => Promise.all([api.accounts.list(), api.accounts.fxRates(), api.settings.all()]),
    [],
  )
  const accounts = useMemo(() => loaded?.[0] ?? [], [loaded])
  const fxRates = useMemo(() => loaded?.[1] ?? [], [loaded])
  const baseCurrency = loaded ? (loaded[2].base_currency ?? 'EUR') : 'EUR'

  // Default the new-account form to the base currency once it's known.
  useEffect(() => {
    setForm(f => ({ ...f, currency: baseCurrency }))
  }, [baseCurrency])

  // Reset the editable FX map from the server whenever a (re)fetch resolves.
  useEffect(() => {
    const fxMap: Record<string, string> = {}
    fxRates.forEach(r => { fxMap[r.currency] = String(r.rate_to_base) })
    setEditFx(fxMap)
  }, [fxRates])

  async function createAccount() {
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await api.accounts.create(form)
      setForm({ name: '', currency: baseCurrency, account_type: 'liquid' })
      setShowForm(false)
      setMsg({ type: 'success', text: 'Account created.' })
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(a: Account) {
    await api.accounts.update(a.id, { active: !a.active })
    reload()
  }

  async function saveFxRate(currency: string) {
    const rate = parseFloat(editFx[currency] ?? '')
    if (isNaN(rate) || rate <= 0) return
    setSaving(true)
    try {
      await api.accounts.upsertFxRate(currency, rate)
      setMsg({ type: 'success', text: `FX rate for ${currency} saved.` })
      reload()
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner />

  if (error) return (
    <div>
      <div className="page-header"><h1>Accounts & FX</h1></div>
      <Alert type="error">Couldn't load accounts: {error}</Alert>
    </div>
  )

  const nonBaseCurrencies = [...new Set(accounts.map(a => a.currency))].filter(c => c !== baseCurrency)

  return (
    <div>
      <div className="page-header">
        <h1>Accounts & FX</h1>
        <p>Manage your accounts and foreign exchange rates</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div className="section-title" style={{ margin: 0 }}>Accounts</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Account'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '0.75rem', alignItems: 'end' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Account Name</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. BBVA Checking" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Currency</label>
              <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Type</label>
              <select value={form.account_type} onChange={e => setForm(f => ({ ...f, account_type: e.target.value }))}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button className="btn btn-primary btn-sm" onClick={createAccount} disabled={saving}>
              {saving ? 'Saving…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ marginBottom: '2rem' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Currency</th>
              <th>Type</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map(a => (
              <tr key={a.id} style={{ opacity: a.active ? 1 : 0.45 }}>
                <td>{a.name}</td>
                <td><span className="badge" style={{ background: 'rgba(61,142,248,0.15)', color: '#3d8ef8' }}>{a.currency}</span></td>
                <td><span className="badge" style={{ background: 'rgba(107,114,128,0.2)', color: '#9ca3af' }}>{a.account_type}</span></td>
                <td>
                  <span className="badge" style={{
                    background: a.active ? 'rgba(16,217,142,0.15)' : 'rgba(107,114,128,0.15)',
                    color: a.active ? '#10d98e' : '#6b7b94',
                  }}>
                    {a.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => toggleActive(a)}>
                    {a.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
            {!accounts.length && (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No accounts yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {nonBaseCurrencies.length > 0 && (
        <>
          <div className="section-title">FX Rates to Base Currency ({baseCurrency})</div>
          <div className="card">
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Set how many {baseCurrency} each unit of foreign currency is worth (e.g. USD 0.92 means 1 USD = 0.92 {baseCurrency}).
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {nonBaseCurrencies.map(curr => (
                <div key={curr} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ fontWeight: 600, minWidth: 40 }}>{curr}</span>
                  <input
                    type="number" step="0.0001" min="0"
                    value={editFx[curr] ?? ''}
                    onChange={e => setEditFx(fx => ({ ...fx, [curr]: e.target.value }))}
                    style={{ width: 100 }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => saveFxRate(curr)} disabled={saving}>
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
