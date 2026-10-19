import { useEffect, useState, useRef } from 'react'
import { api, type Account, type AdapterInfo, type ImportPreviewTransactionRow, type ImportPreviewBalanceRow } from '../api/client'
import { Link, useSearchParams } from 'react-router-dom'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import { fmtAmount } from '../utils/money'

type PreviewData = {
  adapter: string
  imports: string
  rows: ImportPreviewTransactionRow[] | ImportPreviewBalanceRow[]
  count: number
}

export default function Import() {
  const [searchParams] = useSearchParams()
  const initialType = searchParams.get('type') === 'balances' ? 'balances' : 'transactions'
  const [importType, setImportType] = useState(initialType)
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [adapters, setAdapters]   = useState<AdapterInfo[]>([])
  const [loading, setLoading]     = useState(true)
  const [accountId, setAccountId] = useState(searchParams.get('account_id') ?? '')
  const [adapter, setAdapter]     = useState('')
  const [file, setFile]           = useState<File | null>(null)
  const [preview, setPreview]     = useState<PreviewData | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [page, setPage]           = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const previewVersion = useRef(0)
  function invalidatePreview() { previewVersion.current++; setPreview(null); setPreviewing(false) }
  const PAGE_SIZE = 20

  useEffect(() => {
    Promise.all([api.accounts.list(true), api.import.adapters()])
      .then(([a, ad]) => { setAccounts(a); setAdapters(ad); setAccountId(id => a.some(account => String(account.id) === id) ? id : '') })
      .catch((e: unknown) => {
        setMsg({ type: 'error', text: `Impossibile caricare conti e formati: ${e instanceof Error ? e.message : String(e)}` })
      })
      .finally(() => setLoading(false))
  }, [])

  async function doPreview() {
    if (!file || !accountId || !adapter) return
    const version = ++previewVersion.current
    setPreviewing(true)
    setPreview(null)
    setMsg(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', accountId)
      fd.append('adapter_name', adapter)
      const res = await api.import.preview(fd)
      if (version !== previewVersion.current) return
      setPreview({ adapter, imports: res.imports, rows: res.preview, count: res.total })
      setPage(0)
    } catch (e: unknown) {
      if (version === previewVersion.current) setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      if (version === previewVersion.current) setPreviewing(false)
    }
  }

  async function doConfirm() {
    if (!file || !accountId || !adapter || !preview) return
    setConfirming(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('account_id', accountId)
      fd.append('adapter_name', adapter)
      const res = await api.import.confirm(fd)
      setMsg({ type: 'success', text: `Imported ${res.inserted} righe (${res.skipped} duplicates skipped).` })
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
      <Link className="context-back" to={importType === 'balances' ? '/wealth/accounts' : '/transactions'}>← Torna a {importType === 'balances' ? 'conti e saldi' : 'movimenti'}</Link>
      <div className="page-header">
        <h1>Importa i tuoi dati</h1>
        <p>Scegli un file, controlla l’anteprima e conferma l’importazione.</p>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <label className="import-kind">Cosa vuoi importare?
          <select disabled={confirming} value={importType} onChange={e => { setImportType(e.target.value); setAdapter(''); invalidatePreview() }}>
            <option value="transactions">Movimenti</option><option value="balances">Saldi</option>
          </select>
        </label>
        <div className="import-fields">
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="import-account">Conto</label>
            <select disabled={confirming} id="import-account" value={accountId} onChange={e => { setAccountId(e.target.value); invalidatePreview() }}>
              <option value="">Seleziona un conto…</option>
              {accounts.map(a => <option key={a.id} value={String(a.id)}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label htmlFor="import-format">Formato del file</label>
            <select disabled={confirming} id="import-format" value={adapter} onChange={e => { setAdapter(e.target.value); invalidatePreview() }}>
              <option value="">Seleziona un formato…</option>
              {adapters.filter(a => a.imports === importType).map(a => <option key={a.name} value={a.name}>{a.name} ({a.file_types.join(', ')})</option>)}
            </select>
          </div>
        </div>

        {selectedAdapter && (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Contenuto: <strong>{selectedAdapter.imports}</strong> · Formati: {selectedAdapter.file_types.join(', ')}
          </p>
        )}

        <div className="form-group" style={{ margin: '1rem 0 0' }}>
          <label htmlFor="import-file">File</label>
          <input
            disabled={confirming}
            id="import-file"
            ref={fileRef}
            type="file"
            accept={selectedAdapter ? selectedAdapter.file_types.map(t => `.${t}`).join(',') : undefined}
            onChange={e => { setFile(e.target.files?.[0] ?? null); invalidatePreview() }}
            style={{ padding: '0.4rem' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
          <button
            className="btn btn-secondary"
            onClick={doPreview}
            disabled={!file || !accountId || !adapter || previewing}
          >
            {previewing ? <><span className="spinner" style={{ width: 14, height: 14 }} /> Preparazione anteprima…</> : 'Mostra anteprima'}
          </button>
        </div>
      </div>

      {preview && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="section-title" style={{ margin: 0 }}>
              Anteprima — {preview.count} righe ({preview.imports})
            </div>
            <button
              className="btn btn-primary"
              onClick={doConfirm}
              disabled={confirming}
            >
              {confirming ? 'Importazione…' : `Conferma importazione (${preview.count} righe)`}
            </button>
          </div>

          <div className="table-wrap">
            {preview.imports === 'transactions' ? (
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th>Riferimento</th>
                    <th style={{ textAlign: 'right' }}>Importo</th>
                    <th>Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows as ImportPreviewTransactionRow[]).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
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
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Importo originale</th>
                    <th style={{ textAlign: 'right' }}>Importo convertito</th>
                  </tr>
                </thead>
                <tbody>
                  {(preview.rows as ImportPreviewBalanceRow[]).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_native)}</td>
                      <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtAmount(r.amount_base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {preview.count > PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.75rem', fontSize: '0.85rem' }}>
              <button className="btn btn-secondary" onClick={() => setPage(p => p - 1)} disabled={page === 0} style={{ padding: '0.25rem 0.6rem' }}>←</button>
              <span style={{ color: 'var(--text-muted)' }}>
                Pagina {page + 1} di {Math.ceil(preview.count / PAGE_SIZE)}
              </span>
              <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={(page + 1) * PAGE_SIZE >= preview.count} style={{ padding: '0.25rem 0.6rem' }}>→</button>
            </div>
          )}
        </div>
      )}

      {!adapters.length && (
        <Alert type="warning">
          Nessun formato disponibile. Controlla la configurazione delle importazioni.
        </Alert>
      )}
    </div>
  )
}
