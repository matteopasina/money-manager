import { useEffect, useState, useCallback } from 'react'
import { api, type BalanceRow, type Account } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { fmtAmount } from '../components/MoneyChart'

export default function ManageBalances() {
  const [rows, setRows]           = useState<BalanceRow[]>([])
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterAccount, setFilterAccount] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editVals, setEditVals]   = useState({ amount_native: '', amount_base: '' })
  const [saving, setSaving]       = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const [b, a] = await Promise.all([api.balances.list(), api.accounts.list()])
    setRows(b)
    setAccounts(a)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

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

  const visible = filterAccount
    ? rows.filter(r => String(r.account_id) === filterAccount)
    : rows

  return (
    <div>
      <div className="page-header">
        <h1>Manage Balances</h1>
        <p>Edit or delete individual balance entries</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div style={{ marginBottom: '1rem', maxWidth: 300 }}>
        <label className="metric-label" style={{ marginBottom: '0.25rem', display: 'block' }}>Filter by account</label>
        <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="">All accounts</option>
          {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name}</option>)}
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Account</th>
                <th>Currency</th>
                <th style={{ textAlign: 'right' }}>Amount (native)</th>
                <th style={{ textAlign: 'right' }}>Amount (base)</th>
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
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No entries</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
