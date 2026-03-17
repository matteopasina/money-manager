import { useEffect, useState, useRef } from 'react'
import { api, type Account, type AdapterInfo, type TransactionRow, type BalanceRow } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { fmtAmount } from '../components/MoneyChart'

type PreviewData = {
  adapter: string
  imports: string
  rows: TransactionRow[] | BalanceRow[]
  count: number
}

export default function Import() {
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [adapters, setAdapters]   = useState<AdapterInfo[]>([])
  const [loading, setLoading]     = useState(true)
  const [accountId, setAccountId] = useState('')
  const [adapter, setAdapter]     = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [preview, setPreview]     = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([api.accounts.list(true), api.import.adapters()])
      .then(([a, ad]) => { setAccounts(a); setAdapters(ad) })
      .finally(() => setLoading(false))
  }, [])

  async function doPreview() {
    if (!file || !accountId || !adapter) return
    setPreviewing(true)
    setPreview(null)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', accountId)
      fd.append('adapter', adapter)
      const res = await api.import.preview(fd)
      if (res.error) throw new Error(res.error)
      setPreview(res)
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setPreviewing(false)
    }
  }

  async function doConfirm() {
    if (!file || !accountId || !adapter) return
    setConfirming(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', accountId)
      fd.append('adapter', adapter)
      const res = await api.import.confirm(fd)
      if (res.error) throw new Error(res.error)
      setMsg({ type: 'success', text: `Imported ${res.imported} rows (${res.skipped} duplicates skipped).` })
      setPreview(null)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setConfirming(false)
    }
  }

  if (loading) return <LoadingSpinner />

  const selectedAdapter = adapters.find(a => a.name === adapter)

  return (
    <div>
      <div className="page-header">
        <h1>Import</h1>
        <p>Upload a bank file to import transactions or balance snapshots</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Account</label>
            <select value={accountId} onChange={e => { setAccountId(e.target.value); setPreview(null) }}>
              <option value="">Select account…</option>
              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Adapter / Format</label>
            <select value={adapter} onChange={e => { setAdapter(e.target.value); setPreview(null) }}>
              <option value="">Select adapter…</option>
              {adapters.map(a => <option key={a.name} value={a.name}>{a.name} ({a.file_types.join(', ')})</option>)}
            </select>
          </div>
        </div>

        {selectedAdapter && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Imports: <strong>{selectedAdapter.imports}</strong> · Formats: {selectedAdapter.file_types.join(', ')}
          </p>
        )}

        <div className="form-group" style={{ margin: '1rem 0 0' }}>
          <label>File</label>
          <input
            ref={fileRef}
            type="file"
            accept={selectedAdapter ? selectedAdapter.file_types.map(t => `.${t}`).join(',') : undefined}
            onChange={e => { setFile(e.target.files?.[0] ?? null); setPreview(null) }}
            style={{ padding: '0.4rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={doPreview}
            disabled={!file || !accountId || !adapter || previewing}
          >
            {previewing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Previewing…</> : 'Preview'}
          </button>
        </div>
      </div>

      {preview && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="section-title" style={{ margin: 0 }}>
              Preview — {preview.count} rows ({preview.imports})
            </div>
            <button
              className="btn btn-primary"
              onClick={doConfirm}
              disabled={confirming}
            >
              {confirming ? 'Importing…' : `Confirm Import (${preview.count} rows)`}
            </button>
          </div>

          <div className="table-wrap">
            {preview.imports === 'transactions' ? (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Reference</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th>Category</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows as TransactionRow[]).slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td>{r.description}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{r.reference}</td>
                      <td style={{ textAlign: 'right', color: r.amount < 0 ? 'var(--danger)' : 'var(--accent-green)', fontVariantNumeric: 'tabular-nums' }}>
                        {fmtAmount(r.amount)}
                      </td>
                      <td>{r.category && <span className="badge" style={{ background: 'rgba(107,114,128,0.2)', color: '#9ca3af' }}>{r.category}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Account</th>
                    <th style={{ textAlign: 'right' }}>Amount (native)</th>
                    <th style={{ textAlign: 'right' }}>Amount (base)</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows as BalanceRow[]).slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td>{r.account}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_native)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {preview.count > 50 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Showing first 50 of {preview.count} rows.
            </p>
          )}
        </div>
      )}

      {!adapters.length && (
        <Alert type="warning">
          No adapters found. Add a Python file implementing <code>BaseAdapter</code> to <code>backend/adapters/</code>.
        </Alert>
      )}
    </div>
  )
}
