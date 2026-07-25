import { useEffect, useRef, useState } from 'react'
import { api, SECRET_MASK } from '../api/client'
import type { Account, SyncStatus } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'
import SyncStatusCard from './connections/SyncStatusCard'
import IBCard from './connections/IBCard'
import BinanceCard from './connections/BinanceCard'
import RevolutCard from './connections/RevolutCard'
import BbvaCard from './connections/BbvaCard'
import { initialAccountId } from './connections/utils'

type Msg = { type: 'success' | 'error'; text: string }
type EbAccount = { uid: string; name: string; currency: string }

export default function Connections() {
  const [loading, setLoading]     = useState(true)
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [settings, setSettings]   = useState<Record<string, string>>({})
  const [msg, setMsg]             = useState<Msg | null>(null)

  // Auto-sync state
  const [syncStatus, setSyncStatus]   = useState<SyncStatus | null>(null)
  const [syncingNow, setSyncingNow]   = useState(false)

  // Enable Banking credentials — shared between Revolut and BBVA, which both
  // authenticate through the same application.
  const [ebAppId, setEbAppId]           = useState('')
  const [ebPrivateKey, setEbPrivateKey] = useState('') // write-only: blank unless replacing
  const [ebKeySaved, setEbKeySaved]     = useState(false) // a key is stored server-side

  // Connection state touched by the OAuth-redirect handler below, so it has
  // to live here rather than inside RevolutCard/BbvaCard.
  const [revolutConnected, setRevolutConnected]   = useState(false)
  const [revolutEbAccounts, setRevolutEbAccounts] = useState<EbAccount[]>([])
  const [bbvaConnected, setBbvaConnected]         = useState(false)
  const [bbvaEbAccounts, setBbvaEbAccounts]       = useState<EbAccount[]>([])

  useEffect(() => {
    Promise.all([
      api.settings.all(),
      api.accounts.list(),
      api.sync.status().catch(() => null),
    ]).then(([s, accs, sync]) => {
      setAccounts(accs)
      setSettings(s)
      setSyncStatus(sync)
      setEbAppId(s.enablebanking_application_id || '')
      setEbKeySaved(s.enablebanking_private_key === SECRET_MASK)
      setRevolutConnected(!!s.revolut_eb_session_id)
      setBbvaConnected(!!s.bbva_eb_session_id)
    }).catch((e: unknown) => {
      setMsg({ type: 'error', text: `Couldn't load connection settings: ${e instanceof Error ? e.message : String(e)}` })
    }).finally(() => setLoading(false))
  }, [])

  // Enable Banking auth flow (Revolut / BBVA) redirects back here with
  // ?code=...&state=<provider>. Both providers share this handler.
  const exchangedCode = useRef(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const state = params.get('state')
    // Guard against StrictMode double-invoke: the auth code is single-use, so a
    // second exchange fails with WRONG_SESSION_STATUS and would show a false error.
    if (!code || exchangedCode.current) return
    if (state !== 'revolut' && state !== 'bbva') return
    exchangedCode.current = true

    const exchange = state === 'revolut' ? api.revolut.exchangeCode(code) : api.bbva.exchangeCode(code)
    const label = state === 'revolut' ? 'Revolut' : 'BBVA'
    exchange.then(res => {
      if (state === 'revolut') { setRevolutConnected(true); setRevolutEbAccounts(res.accounts) }
      else { setBbvaConnected(true); setBbvaEbAccounts(res.accounts) }
      setMsg({ type: 'success', text: `${label} connected successfully!` })
    }).catch((e: unknown) => {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    }).finally(() => {
      window.history.replaceState(null, '', window.location.pathname)
    })
  }, [])

  async function updateSyncSettings(enabled: boolean, intervalHours: number) {
    // Optimistic update; the scheduler reads these live on its next tick
    setSyncStatus(st => st ? { ...st, enabled, interval_hours: intervalHours } : st)
    try {
      await api.sync.updateSettings(enabled, intervalHours)
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
      api.sync.status().then(setSyncStatus).catch(() => {})
    }
  }

  async function syncNow() {
    setSyncingNow(true)
    try {
      const res = await api.sync.runNow()
      setSyncStatus(res)
      const ran    = (res.results ?? []).filter(r => r.result === 'success').length
      const failed = (res.results ?? []).filter(r => r.result === 'error').length
      setMsg(failed > 0
        ? { type: 'error', text: `Sync finished: ${ran} ok, ${failed} failed — see status below.` }
        : { type: 'success', text: `Sync finished: ${ran} integration${ran === 1 ? '' : 's'} synced.` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncingNow(false)
    }
  }

  /** Persist the shared Enable Banking credentials. The private key is
   * write-only: it's only sent when the user typed a new one; otherwise the
   * server keeps the stored (encrypted) key. Returns false if no key is
   * available at all. */
  async function saveEbCredentials(): Promise<boolean> {
    if (!ebAppId.trim() || (!ebPrivateKey.trim() && !ebKeySaved)) {
      setMsg({ type: 'error', text: 'Enter your Application ID and Private Key first.' })
      return false
    }
    const writes = [api.settings.set('enablebanking_application_id', ebAppId.trim())]
    if (ebPrivateKey.trim()) writes.push(api.settings.set('enablebanking_private_key', ebPrivateKey.trim()))
    await Promise.all(writes)
    if (ebPrivateKey.trim()) { setEbKeySaved(true); setEbPrivateKey('') }
    return true
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Connections</h1>
          <p>Connect external accounts to import data automatically — set up once, then sync anytime</p>
        </div>
      </div>

      {msg && <Alert type={msg.type} onClose={() => setMsg(null)}>{msg.text}</Alert>}

      <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>

        {syncStatus && (
          <SyncStatusCard
            syncStatus={syncStatus}
            syncingNow={syncingNow}
            onUpdateSettings={updateSyncSettings}
            onSyncNow={syncNow}
          />
        )}

        <IBCard
          accounts={accounts}
          onMsg={setMsg}
          initial={{
            tokenSaved: settings.ib_token === SECRET_MASK,
            txnQid: settings.ib_transactions_query_id || '',
            navQid: settings.ib_nav_query_id || '',
            accountId: initialAccountId(accounts, settings.ib_account_id),
          }}
        />

        <BinanceCard
          accounts={accounts}
          onMsg={setMsg}
          initial={{
            apiKey: settings.binance_api_key || '',
            secretSaved: settings.binance_api_secret === SECRET_MASK,
            accountId: initialAccountId(accounts, settings.binance_account_id),
          }}
        />

        <RevolutCard
          accounts={accounts}
          onMsg={setMsg}
          initial={{
            aspspName: settings.revolut_eb_aspsp_name || '',
            aspspCountry: settings.revolut_eb_aspsp_country || '',
            accountId: initialAccountId(accounts, settings.revolut_account_id),
          }}
          connected={revolutConnected}
          ebAccounts={revolutEbAccounts}
          ebAppId={ebAppId}
          setEbAppId={setEbAppId}
          ebPrivateKey={ebPrivateKey}
          setEbPrivateKey={setEbPrivateKey}
          ebKeySaved={ebKeySaved}
          saveEbCredentials={saveEbCredentials}
        />

        <BbvaCard
          accounts={accounts}
          onMsg={setMsg}
          initial={{
            aspspName: settings.bbva_eb_aspsp_name || '',
            aspspCountry: settings.bbva_eb_aspsp_country || '',
            accountId: initialAccountId(accounts, settings.bbva_account_id),
          }}
          connected={bbvaConnected}
          ebAccounts={bbvaEbAccounts}
          ebAppId={ebAppId}
          setEbAppId={setEbAppId}
          ebPrivateKey={ebPrivateKey}
          setEbPrivateKey={setEbPrivateKey}
          ebKeySaved={ebKeySaved}
          saveEbCredentials={saveEbCredentials}
        />

        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          opacity: 0.5, padding: '14px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 18,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--border)', flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--ink)' }}>Crypto.com</div>
            <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>Import transactions from the Crypto.com app.</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--ink-faint)' }}>Coming soon</span>
        </div>
      </div>
    </div>
  )
}
