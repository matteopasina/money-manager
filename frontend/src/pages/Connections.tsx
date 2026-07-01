import { useEffect, useRef, useState } from 'react'
import { api, SECRET_MASK } from '../api/client'
import type { Account, SyncStatus } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

const SYNC_INTERVALS = [
  { hours: 6,   label: 'Every 6 hours' },
  { hours: 12,  label: 'Every 12 hours' },
  { hours: 24,  label: 'Daily' },
  { hours: 72,  label: 'Every 3 days' },
  { hours: 168, label: 'Weekly' },
]

function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

export default function Connections() {
  const [loading, setLoading]     = useState(true)
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Auto-sync state
  const [syncStatus, setSyncStatus]   = useState<SyncStatus | null>(null)
  const [syncingNow, setSyncingNow]   = useState(false)

  // IB state
  const [ibToken, setIbToken]     = useState('')          // write-only: blank unless replacing
  const [ibTokenSaved, setIbTokenSaved] = useState(false) // a token is stored server-side
  const [ibTxnQid, setIbTxnQid]   = useState('')
  const [ibNavQid, setIbNavQid]   = useState('')
  const [ibAccountId, setIbAccountId] = useState<number | ''>('')
  const [ibSyncing, setIbSyncing] = useState<'transactions' | 'nav' | null>(null)
  const [ibSaving, setIbSaving]   = useState(false)
  const [ibGuideOpen, setIbGuideOpen] = useState(false)

  // Binance state
  const [bnApiKey, setBnApiKey]       = useState('')
  const [bnApiSecret, setBnApiSecret] = useState('')          // write-only: blank unless replacing
  const [bnSecretSaved, setBnSecretSaved] = useState(false)   // a secret is stored server-side
  const [bnAccountId, setBnAccountId] = useState<number | ''>('')
  const [bnSyncing, setBnSyncing]     = useState<'transactions' | 'portfolio' | null>(null)
  const [bnSaving, setBnSaving]       = useState(false)
  const [bnGuideOpen, setBnGuideOpen] = useState(false)

  // Revolut state (via Enable Banking)
  const [ebAppId, setEbAppId]                       = useState('')
  const [ebPrivateKey, setEbPrivateKey]             = useState('') // write-only: blank unless replacing
  const [ebKeySaved, setEbKeySaved]                 = useState(false) // a key is stored server-side
  const [revolutAccountId, setRevolutAccountId]     = useState<number | ''>('')
  const [revolutConnected, setRevolutConnected]     = useState(false)
  const [revolutAspspName, setRevolutAspspName]     = useState('')
  const [revolutAspspCountry, setRevolutAspspCountry] = useState('')
  const [revolutLookupCountry, setRevolutLookupCountry] = useState('LT')
  const [revolutAspspOptions, setRevolutAspspOptions] = useState<{ name: string; country: string }[]>([])
  const [revolutEbAccounts, setRevolutEbAccounts]   = useState<{ uid: string; name: string; currency: string }[]>([])
  const [revolutSaving, setRevolutSaving]           = useState(false)
  const [revolutLookingUp, setRevolutLookingUp]     = useState(false)
  const [revolutConnecting, setRevolutConnecting]   = useState(false)
  const [revolutSyncing, setRevolutSyncing]         = useState<'transactions' | 'balances' | null>(null)
  const [revolutGuideOpen, setRevolutGuideOpen]     = useState(false)

  // BBVA state (via Enable Banking — shares ebAppId / ebPrivateKey with Revolut)
  const [bbvaAccountId, setBbvaAccountId]         = useState<number | ''>('')
  const [bbvaConnected, setBbvaConnected]         = useState(false)
  const [bbvaAspspName, setBbvaAspspName]         = useState('')
  const [bbvaAspspCountry, setBbvaAspspCountry]   = useState('')
  const [bbvaLookupCountry, setBbvaLookupCountry] = useState('IT')
  const [bbvaAspspOptions, setBbvaAspspOptions]   = useState<{ name: string; country: string }[]>([])
  const [bbvaEbAccounts, setBbvaEbAccounts]       = useState<{ uid: string; name: string; currency: string }[]>([])
  const [bbvaSaving, setBbvaSaving]               = useState(false)
  const [bbvaLookingUp, setBbvaLookingUp]         = useState(false)
  const [bbvaConnecting, setBbvaConnecting]       = useState(false)
  const [bbvaSyncing, setBbvaSyncing]             = useState<'transactions' | 'balances' | null>(null)
  const [bbvaGuideOpen, setBbvaGuideOpen]         = useState(false)

  useEffect(() => {
    Promise.all([
      api.settings.all(),
      api.accounts.list(),
      api.sync.status().catch(() => null),
    ]).then(([s, accs, sync]) => {
      setAccounts(accs)
      setSyncStatus(sync)

      // Secrets come back masked (SECRET_MASK = "a value is saved server-side").
      // The inputs stay blank; typing a new value replaces the stored one.
      const tokenSaved = s.ib_token === SECRET_MASK
      const txnQid = s.ib_transactions_query_id || '', navQid = s.ib_nav_query_id || ''
      setIbTokenSaved(tokenSaved)
      setIbTxnQid(txnQid)
      setIbNavQid(navQid)
      setIbGuideOpen(!(tokenSaved && txnQid && navQid))
      if (s.ib_account_id) setIbAccountId(Number(s.ib_account_id))
      else if (accs.length > 0) setIbAccountId(accs[0].id)

      const bnKey = s.binance_api_key || '', bnSecretSaved = s.binance_api_secret === SECRET_MASK
      setBnApiKey(bnKey)
      setBnSecretSaved(bnSecretSaved)
      setBnGuideOpen(!(bnKey && bnSecretSaved))
      if (s.binance_account_id) setBnAccountId(Number(s.binance_account_id))
      else if (accs.length > 0) setBnAccountId(accs[0].id)

      setBbvaAspspName(s.bbva_eb_aspsp_name || '')
      setBbvaAspspCountry(s.bbva_eb_aspsp_country || '')
      setBbvaConnected(!!s.bbva_eb_session_id)
      setBbvaGuideOpen(!s.bbva_eb_session_id)
      if (s.bbva_account_id) setBbvaAccountId(Number(s.bbva_account_id))
      else if (accs.length > 0) setBbvaAccountId(accs[0].id)

      setEbAppId(s.enablebanking_application_id || '')
      setEbKeySaved(s.enablebanking_private_key === SECRET_MASK)
      setRevolutAspspName(s.revolut_eb_aspsp_name || '')
      setRevolutAspspCountry(s.revolut_eb_aspsp_country || '')
      setRevolutGuideOpen(!s.revolut_eb_session_id)
      setRevolutConnected(!!s.revolut_eb_session_id)
      if (s.revolut_account_id) setRevolutAccountId(Number(s.revolut_account_id))
      else if (accs.length > 0) setRevolutAccountId(accs[0].id)
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

  async function saveIbSettings() {
    setIbSaving(true)
    try {
      const writes = [
        api.settings.set('ib_transactions_query_id', ibTxnQid.trim()),
        api.settings.set('ib_nav_query_id', ibNavQid.trim()),
        api.settings.set('ib_account_id', String(ibAccountId)),
      ]
      // Write-only secret: only send when the user typed a new one
      if (ibToken.trim()) writes.push(api.settings.set('ib_token', ibToken.trim()))
      await Promise.all(writes)
      if (ibToken.trim()) { setIbTokenSaved(true); setIbToken('') }
      setMsg({ type: 'success', text: 'IB settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setIbSaving(false)
    }
  }

  async function ibSync(type: 'transactions' | 'nav') {
    if (!ibAccountId) return setMsg({ type: 'error', text: 'Select an account first.' })
    setIbSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.ib.syncTransactions(ibAccountId as number)
        : await api.ib.syncNav(ibAccountId as number)
      setMsg({ type: 'success', text: `IB sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setIbSyncing(null)
    }
  }

  async function saveBnSettings() {
    setBnSaving(true)
    try {
      const writes = [
        api.settings.set('binance_api_key', bnApiKey.trim()),
        api.settings.set('binance_account_id', String(bnAccountId)),
      ]
      // Write-only secret: only send when the user typed a new one
      if (bnApiSecret.trim()) writes.push(api.settings.set('binance_api_secret', bnApiSecret.trim()))
      await Promise.all(writes)
      if (bnApiSecret.trim()) { setBnSecretSaved(true); setBnApiSecret('') }
      setMsg({ type: 'success', text: 'Binance settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBnSaving(false)
    }
  }

  async function bnSync(type: 'transactions' | 'portfolio') {
    if (!bnAccountId) return setMsg({ type: 'error', text: 'Select an account first.' })
    setBnSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.binance.syncTransactions(bnAccountId as number)
        : await api.binance.syncPortfolio(bnAccountId as number)
      setMsg({ type: 'success', text: `Binance sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBnSyncing(null)
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

  async function revolutLookup() {
    setRevolutLookingUp(true)
    try {
      // Persist credentials first — the lookup calls Enable Banking, which needs them server-side.
      if (!(await saveEbCredentials())) return
      const list = await api.revolut.aspsps(revolutLookupCountry)
      setRevolutAspspOptions(list)
      if (list.length === 0) {
        setMsg({ type: 'error', text: `No Revolut entry found for country ${revolutLookupCountry}. Try a different country code (e.g. LT, GB, IE).` })
      }
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRevolutLookingUp(false)
    }
  }

  async function saveRevolutSettings() {
    setRevolutSaving(true)
    try {
      if (!(await saveEbCredentials())) return
      await Promise.all([
        api.settings.set('revolut_eb_aspsp_name', revolutAspspName.trim()),
        api.settings.set('revolut_eb_aspsp_country', revolutAspspCountry.trim()),
        api.settings.set('revolut_account_id', String(revolutAccountId)),
      ])
      setMsg({ type: 'success', text: 'Revolut settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRevolutSaving(false)
    }
  }

  async function revolutConnect() {
    setRevolutConnecting(true)
    try {
      const res = await api.revolut.connect()
      window.open(res.url, '_blank')
      setMsg({ type: 'success', text: 'Authorisation opened in a new tab — approve it there, then come back here.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRevolutConnecting(false)
    }
  }

  async function revolutSync(type: 'transactions' | 'balances') {
    if (!revolutAccountId) return setMsg({ type: 'error', text: 'Select an account first.' })
    setRevolutSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.revolut.syncTransactions(revolutAccountId as number)
        : await api.revolut.syncBalances(revolutAccountId as number)
      setMsg({ type: 'success', text: `Revolut sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setRevolutSyncing(null)
    }
  }

  async function saveBbvaSettings() {
    setBbvaSaving(true)
    try {
      if (!(await saveEbCredentials())) return
      await Promise.all([
        api.settings.set('bbva_eb_aspsp_name', bbvaAspspName.trim()),
        api.settings.set('bbva_eb_aspsp_country', bbvaAspspCountry.trim()),
        api.settings.set('bbva_account_id', String(bbvaAccountId)),
      ])
      setMsg({ type: 'success', text: 'BBVA settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaSaving(false)
    }
  }

  async function bbvaLookup() {
    setBbvaLookingUp(true)
    try {
      // Persist credentials first — the lookup calls Enable Banking, which needs them server-side.
      if (!(await saveEbCredentials())) return
      const list = await api.bbva.aspsps(bbvaLookupCountry)
      setBbvaAspspOptions(list)
      if (list.length === 0) {
        setMsg({ type: 'error', text: `No BBVA entry found for country ${bbvaLookupCountry}. Try a different country code.` })
      }
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaLookingUp(false)
    }
  }

  async function bbvaConnect() {
    setBbvaConnecting(true)
    try {
      const res = await api.bbva.connect()
      window.open(res.url, '_blank')
      setMsg({ type: 'success', text: 'Authorisation opened in a new tab — approve it there, then come back here.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaConnecting(false)
    }
  }

  async function bbvaSync(type: 'transactions' | 'balances') {
    if (!bbvaAccountId) return setMsg({ type: 'error', text: 'Select an account first.' })
    setBbvaSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.bbva.syncTransactions(bbvaAccountId as number)
        : await api.bbva.syncBalances(bbvaAccountId as number)
      setMsg({ type: 'success', text: `BBVA sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaSyncing(null)
    }
  }

  if (loading) return <LoadingSpinner />

  const ibConfigured = !!((ibTokenSaved || ibToken) && ibTxnQid && ibNavQid)
  const bnConfigured = !!(bnApiKey && (bnSecretSaved || bnApiSecret))

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

        {/* ── Automatic sync ──────────────────────────────────────────────── */}
        {syncStatus && (
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Automatic sync</div>
                <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)' }}>
                  Connected accounts sync on app start and then on the chosen interval. Recently synced
                  accounts are skipped until the interval elapses.
                </div>
              </div>
              <button className="btn btn-primary" onClick={syncNow} disabled={syncingNow} style={{ flexShrink: 0 }}>
                {syncingNow ? 'Syncing…' : 'Sync now'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '12px 0 14px', flexWrap: 'wrap' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, cursor: 'pointer', fontSize: '13px', color: 'var(--ink-soft)' }}>
                <input
                  type="checkbox"
                  checked={syncStatus.enabled}
                  onChange={e => updateSyncSettings(e.target.checked, syncStatus.interval_hours)}
                  style={{ width: 'auto' }}
                />
                Enabled
              </label>
              <select
                value={syncStatus.interval_hours}
                onChange={e => updateSyncSettings(syncStatus.enabled, Number(e.target.value))}
                disabled={!syncStatus.enabled}
                style={{ maxWidth: 180 }}
              >
                {SYNC_INTERVALS.map(o => <option key={o.hours} value={o.hours}>{o.label}</option>)}
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {syncStatus.integrations.map(i => {
                const dot = !i.configured ? 'var(--ink-ghost)'
                  : i.last_status === 'error' ? 'var(--loss)'
                  : i.last_status === 'success' ? 'var(--gain)'
                  : 'var(--accent)'
                return (
                  <div key={i.id} style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '12.5px' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0, alignSelf: 'center' }} />
                    <span style={{ fontWeight: 600, color: 'var(--ink)', minWidth: 140 }}>{i.name}</span>
                    <span style={{ color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {!i.configured ? 'Not configured'
                        : i.last_status === 'error' ? `Failed ${relTime(i.last_run_at)} — ${i.last_message}`
                        : i.last_success_at ? `Synced ${relTime(i.last_success_at)}${i.due ? ' · due' : ''}${i.last_status === 'success' && i.last_message ? ` — ${i.last_message}` : ''}`
                        : 'Never synced'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Interactive Brokers ─────────────────────────────────────────── */}
        <ProviderCard
          logo={<IBLogo />}
          name="Interactive Brokers"
          description="Import trades, cash transactions, dividends, and daily portfolio value via Flex Query."
          connected={ibConfigured}
          guideOpen={ibGuideOpen}
          onToggleGuide={() => setIbGuideOpen(o => !o)}
          guideSteps={IB_GUIDE_STEPS}
        >
          <div className="form-group">
            <label>Flex Web Service Token</label>
            <input
              type="password"
              value={ibToken}
              onChange={e => setIbToken(e.target.value)}
              placeholder={ibTokenSaved ? '•••••••• saved — paste a new token to replace' : 'Your IB Flex token'}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Transactions Query ID</label>
            <input value={ibTxnQid} onChange={e => setIbTxnQid(e.target.value)} placeholder="e.g. 123456" />
          </div>
          <div className="form-group">
            <label>NAV Query ID</label>
            <input value={ibNavQid} onChange={e => setIbNavQid(e.target.value)} placeholder="e.g. 789012" />
          </div>
          <div className="form-group">
            <label>Import into account</label>
            <select value={ibAccountId} onChange={e => setIbAccountId(Number(e.target.value))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={saveIbSettings} disabled={ibSaving}>
              {ibSaving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-primary" onClick={() => ibSync('transactions')} disabled={ibSyncing !== null}>
              {ibSyncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
            </button>
            <button className="btn btn-primary" onClick={() => ibSync('nav')} disabled={ibSyncing !== null}>
              {ibSyncing === 'nav' ? 'Syncing…' : 'Sync NAV'}
            </button>
          </div>
        </ProviderCard>

        {/* ── Binance ─────────────────────────────────────────────────────── */}
        <ProviderCard
          logo={<BinanceLogo />}
          name="Binance"
          description="Import deposits, withdrawals, converts, earn rewards, and daily portfolio value via the Binance API."
          connected={bnConfigured}
          guideOpen={bnGuideOpen}
          onToggleGuide={() => setBnGuideOpen(o => !o)}
          guideSteps={BINANCE_GUIDE_STEPS}
        >
          <div className="form-group">
            <label>API Key</label>
            <input value={bnApiKey} onChange={e => setBnApiKey(e.target.value)} placeholder="Your Binance API key" />
          </div>
          <div className="form-group">
            <label>API Secret</label>
            <input
              type="password"
              value={bnApiSecret}
              onChange={e => setBnApiSecret(e.target.value)}
              placeholder={bnSecretSaved ? '•••••••• saved — paste a new secret to replace' : 'Your Binance API secret'}
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Import into account</label>
            <select value={bnAccountId} onChange={e => setBnAccountId(Number(e.target.value))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={saveBnSettings} disabled={bnSaving}>
              {bnSaving ? 'Saving…' : 'Save'}
            </button>
            <button className="btn btn-primary" onClick={() => bnSync('transactions')} disabled={bnSyncing !== null}>
              {bnSyncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
            </button>
            <button className="btn btn-primary" onClick={() => bnSync('portfolio')} disabled={bnSyncing !== null}>
              {bnSyncing === 'portfolio' ? 'Syncing…' : 'Sync Portfolio'}
            </button>
          </div>
        </ProviderCard>

        {/* ── Revolut ─────────────────────────────────────────────────────── */}
        <ProviderCard
          logo={<RevolutLogo />}
          name="Revolut"
          description="Import transactions and balance via the Enable Banking open-banking API."
          connected={revolutConnected}
          guideOpen={revolutGuideOpen}
          onToggleGuide={() => setRevolutGuideOpen(o => !o)}
          guideSteps={REVOLUT_GUIDE_STEPS}
        >
          <div className="form-group">
            <label>Enable Banking Application ID</label>
            <input value={ebAppId} onChange={e => setEbAppId(e.target.value)} placeholder="Your Enable Banking Application ID" />
          </div>
          <div className="form-group">
            <label>Enable Banking Private Key</label>
            <textarea
              value={ebPrivateKey}
              onChange={e => setEbPrivateKey(e.target.value)}
              placeholder={ebKeySaved
                ? '•••••••• saved (encrypted) — paste a new key to replace'
                : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={ebKeySaved ? 2 : 4}
              style={{ fontFamily: 'monospace', fontSize: '11.5px' }}
              autoComplete="off"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>
              Encrypted at rest, stored server-side only — never sent to the browser.
            </p>
          </div>

          <div className="form-group">
            <label>Institution</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={revolutLookupCountry}
                onChange={e => setRevolutLookupCountry(e.target.value.toUpperCase())}
                placeholder="Country code, e.g. LT"
                style={{ maxWidth: 160 }}
              />
              <button className="btn btn-secondary" onClick={revolutLookup} disabled={revolutLookingUp} style={{ whiteSpace: 'nowrap' }}>
                {revolutLookingUp ? 'Looking up…' : 'Look up Revolut'}
              </button>
            </div>
            {revolutAspspOptions.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {revolutAspspOptions.map(opt => (
                  <div
                    key={`${opt.name}-${opt.country}`}
                    style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onClick={() => { setRevolutAspspName(opt.name); setRevolutAspspCountry(opt.country); setRevolutAspspOptions([]) }}
                  >
                    <strong>{opt.name}</strong> <span style={{ color: 'var(--ink-faint)' }}>{opt.country}</span>
                  </div>
                ))}
              </div>
            )}
            {revolutAspspName && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>
                Selected: <strong>{revolutAspspName}</strong> ({revolutAspspCountry})
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Import into account</label>
            <select value={revolutAccountId} onChange={e => setRevolutAccountId(Number(e.target.value))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: revolutConnected ? '1rem' : 0 }}>
            <button className="btn btn-secondary" onClick={saveRevolutSettings} disabled={revolutSaving}>
              {revolutSaving ? 'Saving…' : 'Save'}
            </button>
            {!revolutConnected && (
              <button className="btn btn-primary" onClick={revolutConnect} disabled={revolutConnecting}>
                {revolutConnecting ? 'Connecting…' : 'Connect to Revolut'}
              </button>
            )}
          </div>

          {revolutConnected && (
            <div style={{ marginTop: '1rem' }}>
              {revolutEbAccounts.length > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
                  Accounts: {revolutEbAccounts.map(a => `${a.name} (${a.currency})`).join(', ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => revolutSync('transactions')} disabled={revolutSyncing !== null}>
                  {revolutSyncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
                </button>
                <button className="btn btn-primary" onClick={() => revolutSync('balances')} disabled={revolutSyncing !== null}>
                  {revolutSyncing === 'balances' ? 'Syncing…' : 'Sync Balance'}
                </button>
                <button className="btn btn-secondary" onClick={revolutConnect} disabled={revolutConnecting}>
                  {revolutConnecting ? 'Connecting…' : 'Reconnect'}
                </button>
              </div>
            </div>
          )}
        </ProviderCard>

        {/* ── BBVA ────────────────────────────────────────────────────────── */}
        <ProviderCard
          logo={<BBVALogo />}
          name="BBVA"
          description="Import transactions and balance via the Enable Banking open-banking API."
          connected={bbvaConnected}
          guideOpen={bbvaGuideOpen}
          onToggleGuide={() => setBbvaGuideOpen(o => !o)}
          guideSteps={BBVA_GUIDE_STEPS}
        >
          <div className="form-group">
            <label>Enable Banking Application ID</label>
            <input value={ebAppId} onChange={e => setEbAppId(e.target.value)} placeholder="Your Enable Banking Application ID" />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>
              Shared with Revolut — one Enable Banking application connects to both banks.
            </p>
          </div>
          <div className="form-group">
            <label>Enable Banking Private Key</label>
            <textarea
              value={ebPrivateKey}
              onChange={e => setEbPrivateKey(e.target.value)}
              placeholder={ebKeySaved
                ? '•••••••• saved (encrypted) — paste a new key to replace'
                : '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----'}
              rows={ebKeySaved ? 2 : 4}
              style={{ fontFamily: 'monospace', fontSize: '11.5px' }}
              autoComplete="off"
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-faint)', marginTop: '0.25rem' }}>
              Encrypted at rest, stored server-side only — never sent to the browser.
            </p>
          </div>

          <div className="form-group">
            <label>Institution</label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={bbvaLookupCountry}
                onChange={e => setBbvaLookupCountry(e.target.value.toUpperCase())}
                placeholder="Country code, e.g. IT"
                style={{ maxWidth: 160 }}
              />
              <button className="btn btn-secondary" onClick={bbvaLookup} disabled={bbvaLookingUp} style={{ whiteSpace: 'nowrap' }}>
                {bbvaLookingUp ? 'Looking up…' : 'Look up BBVA'}
              </button>
            </div>
            {bbvaAspspOptions.length > 0 && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                {bbvaAspspOptions.map(opt => (
                  <div
                    key={`${opt.name}-${opt.country}`}
                    style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                    onClick={() => { setBbvaAspspName(opt.name); setBbvaAspspCountry(opt.country); setBbvaAspspOptions([]) }}
                  >
                    <strong>{opt.name}</strong> <span style={{ color: 'var(--ink-faint)' }}>{opt.country}</span>
                  </div>
                ))}
              </div>
            )}
            {bbvaAspspName && (
              <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>
                Selected: <strong>{bbvaAspspName}</strong> ({bbvaAspspCountry})
              </p>
            )}
          </div>

          <div className="form-group">
            <label>Import into account</label>
            <select value={bbvaAccountId} onChange={e => setBbvaAccountId(Number(e.target.value))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: bbvaConnected ? '1rem' : 0 }}>
            <button className="btn btn-secondary" onClick={saveBbvaSettings} disabled={bbvaSaving}>
              {bbvaSaving ? 'Saving…' : 'Save'}
            </button>
            {!bbvaConnected && (
              <button className="btn btn-primary" onClick={bbvaConnect} disabled={bbvaConnecting}>
                {bbvaConnecting ? 'Connecting…' : 'Connect to BBVA'}
              </button>
            )}
          </div>

          {bbvaConnected && (
            <div style={{ marginTop: '1rem' }}>
              {bbvaEbAccounts.length > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
                  Accounts: {bbvaEbAccounts.map(a => `${a.name} (${a.currency})`).join(', ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => bbvaSync('transactions')} disabled={bbvaSyncing !== null}>
                  {bbvaSyncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
                </button>
                <button className="btn btn-primary" onClick={() => bbvaSync('balances')} disabled={bbvaSyncing !== null}>
                  {bbvaSyncing === 'balances' ? 'Syncing…' : 'Sync Balance'}
                </button>
                <button className="btn btn-secondary" onClick={bbvaConnect} disabled={bbvaConnecting}>
                  {bbvaConnecting ? 'Connecting…' : 'Reconnect'}
                </button>
              </div>
            </div>
          )}
        </ProviderCard>

        {/* ── Coming soon ─────────────────────────────────────────────────── */}
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

// ── Provider card shell ──────────────────────────────────────────────────────

function ProviderCard({
  logo, name, description, connected, guideSteps, guideOpen, onToggleGuide, children,
}: {
  logo: React.ReactNode
  name: string
  description: string
  connected: boolean
  guideSteps?: { title: string; body: React.ReactNode }[]
  guideOpen?: boolean
  onToggleGuide?: () => void
  children: React.ReactNode
}) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flexShrink: 0 }}>{logo}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{name}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {description}
          </div>
        </div>
        <span
          className="badge"
          style={{
            color: connected ? 'var(--gain)' : 'var(--ink-faint)',
            background: connected ? 'rgba(63,122,85,0.14)' : 'var(--bg-chip)',
            flexShrink: 0,
          }}
        >
          {connected ? 'Connected' : 'Not connected'}
        </span>
      </div>

      {guideSteps && (
        <>
          <button className="btn-link" style={{ marginBottom: 12, fontSize: 12 }} onClick={onToggleGuide}>
            {guideOpen ? '▲ Hide setup guide' : '▾ Show setup guide'}
          </button>
          {guideOpen && (
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px', marginBottom: 16 }}>
              {guideSteps.map((s, i) => (
                <div key={i} style={{ display: 'flex', gap: 11, marginBottom: i < guideSteps.length - 1 ? 12 : 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'var(--accent)', color: '#FBF7EF',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 700, fontSize: 10, flexShrink: 0,
                  }}>
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--ink)', marginBottom: 2 }}>{s.title}</div>
                    <div style={{ fontSize: 12, lineHeight: 1.55, color: 'var(--ink-soft)' }}>{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {children}
    </div>
  )
}

// ── Guide content ─────────────────────────────────────────────────────────────

const IB_GUIDE_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Create an IB account in Money Manager',
    body: (
      <>
        <p>Before syncing, set up an account to receive the imported data.</p>
        <ol>
          <li>Go to <strong>Accounts & FX</strong> in the sidebar.</li>
          <li>Click <strong>Add account</strong>.</li>
          <li>
            Name it (e.g. <em>Interactive Brokers</em>), set the currency to your IB base
            currency (usually <code>USD</code>), and set the type to <em>Investment</em>.
          </li>
          <li>Save — you will select this account below.</li>
        </ol>
        <p style={{ marginTop: '0.75rem' }}>
          If your IB account currency differs from your Money Manager base currency, add the
          correct FX rate under <strong>Accounts & FX → FX Rates</strong>.
        </p>
      </>
    ),
  },
  {
    title: 'Get your Flex Web Service token',
    body: (
      <>
        <p>The token authorises the app to download your reports from IB.</p>
        <ol>
          <li>Log in to <strong>IB Account Management</strong> (<code>myaccount.ibkr.com</code> or the Client Portal).</li>
          <li>Navigate to <strong>Reports → Settings</strong>.</li>
          <li>Scroll to <strong>Flex Web Service</strong> and click <strong>Generate Token</strong> (or copy an existing one).</li>
          <li>Copy the token — paste it into the field below.</li>
        </ol>
        <Callout>Keep the token secret — it grants read access to your IB activity reports.</Callout>
      </>
    ),
  },
  {
    title: 'Create the Transactions Flex Query',
    body: (
      <>
        <p>This query fetches cash movements (deposits, withdrawals, dividends, interest, commissions) and optionally trade history.</p>
        <ol>
          <li>In IB Account Management go to <strong>Reports → Flex Queries</strong>.</li>
          <li>Click <strong>+</strong> next to <em>Activity Flex Query</em>.</li>
          <li>Name it e.g. <em>Money Manager – Transactions</em>.</li>
          <li>
            Under <strong>Sections</strong>, enable:
            <ul style={{ marginTop: '0.4rem' }}>
              <li><strong>Cash Transactions</strong> — tick <em>Select All</em> for fields.</li>
              <li><strong>Trades</strong> (optional) — tick <em>Select All</em>. Adds buy/sell records.</li>
            </ul>
          </li>
          <li>Set <strong>Format</strong> to <em>XML</em>.</li>
          <li>Choose a <strong>Date Range</strong> (e.g. <em>Last 365 Calendar Days</em>).</li>
          <li>Click <strong>Save</strong> and note the numeric <strong>Query ID</strong> shown in the list.</li>
        </ol>
      </>
    ),
  },
  {
    title: 'Create the NAV Flex Query',
    body: (
      <>
        <p>This query downloads daily portfolio value snapshots for the balance charts.</p>
        <ol>
          <li>In <strong>Reports → Flex Queries</strong>, click <strong>+</strong> again.</li>
          <li>Name it <em>Money Manager – NAV</em>.</li>
          <li>Under <strong>Sections</strong>, enable: <strong>Net Asset Value (NAV) in Base</strong> — tick <em>Select All</em>.</li>
          <li>Set <strong>Format</strong> to <em>XML</em>.</li>
          <li>Choose a date range and click <strong>Save</strong>. Note the Query ID.</li>
        </ol>
        <Callout type="info">IB already converts the NAV to your base currency, so no manual FX conversion is needed.</Callout>
      </>
    ),
  },
  {
    title: 'Configure below',
    body: (
      <p>
        Paste your <strong>Flex Web Service Token</strong>, the <strong>Transactions Query ID</strong> and{' '}
        <strong>NAV Query ID</strong> into the fields below, select the IB account you created in step 1, and click <strong>Save</strong>.
      </p>
    ),
  },
  {
    title: 'Sync your data',
    body: (
      <>
        <ul>
          <li><strong>Sync Transactions</strong> — imports cash flows and trades. Shows how many rows were added vs. skipped as duplicates.</li>
          <li><strong>Sync NAV</strong> — imports daily portfolio values shown in Dashboard balance charts.</li>
        </ul>
        <Callout type="info">Both syncs are <strong>idempotent</strong> — safe to run multiple times, no duplicates created.</Callout>
        <p style={{ marginTop: '0.75rem' }}>
          After syncing, visit <strong>Transactions</strong> to review and categorise entries, or set up
          keyword rules under <strong>Categories & Rules</strong> to auto-categorise future syncs.
        </p>
      </>
    ),
  },
]

const BINANCE_GUIDE_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Create a Binance account in Money Manager',
    body: (
      <>
        <ol>
          <li>Go to <strong>Accounts & FX</strong> in the sidebar.</li>
          <li>Click <strong>Add account</strong>.</li>
          <li>Name it (e.g. <em>Binance</em>), set currency to <code>USDT</code>, type to <em>Investment</em>.</li>
          <li>Save — you will select this account below.</li>
        </ol>
        <p style={{ marginTop: '0.75rem' }}>
          Also add a <strong>USDT FX rate</strong> under <strong>Accounts & FX → FX Rates</strong> (e.g. 0.92 for EUR base).
          If you hold BTC or ETH, add those rates too — they are used to convert your portfolio value.
        </p>
      </>
    ),
  },
  {
    title: 'Create a read-only API key',
    body: (
      <>
        <ol>
          <li>Log in to Binance → <strong>Profile → API Management</strong>.</li>
          <li>Click <strong>Create API Key</strong> → choose <em>System-generated</em>.</li>
          <li>Give it a name (e.g. <em>Money Manager</em>) and complete 2FA.</li>
          <li>
            Enable <strong>Enable Reading</strong> only. <strong>Do not enable</strong> Spot & Margin
            Trading, Withdrawals, or any other permission — the app never needs them.
          </li>
        </ol>
        <Callout>Your API Secret is shown only once. Copy it immediately and store it safely before closing the page.</Callout>
      </>
    ),
  },
  {
    title: 'Configure below',
    body: (
      <p>
        Paste your <strong>API Key</strong> and <strong>API Secret</strong> into the fields below,
        select the Binance account you created in step 1, and click <strong>Save</strong>.
      </p>
    ),
  },
  {
    title: 'Sync your data',
    body: (
      <>
        <ul>
          <li><strong>Sync Transactions</strong> — imports the last 90 days of deposits, withdrawals, converts (swaps), and Simple Earn rewards.</li>
          <li><strong>Sync Portfolio</strong> — prices all current holdings in USDT and adds today's total as a balance snapshot.</li>
        </ul>
        <Callout type="info">Both syncs are idempotent — safe to run multiple times, no duplicates.</Callout>
      </>
    ),
  },
]

const REVOLUT_GUIDE_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Register an Enable Banking application',
    body: (
      <>
        <p>
          Enable Banking is an open-banking aggregator with a free self-serve mode for individual
          developers — no business registration or approval wait required.
        </p>
        <ol>
          <li>Go to <strong>enablebanking.com/cp</strong> and sign up.</li>
          <li>Click <strong>Add a new application</strong>.</li>
          <li>Choose <strong>Production</strong> as the environment — <em>Sandbox</em> only has fake test data.</li>
          <li>Keep <strong>Generate in the browser (using SubtleCrypto) and export private key</strong> selected — it's the simplest option.</li>
          <li>Name the application (e.g. <em>Money Manager</em>) and register it.</li>
        </ol>
        <Callout>
          Save the downloaded private key file somewhere safe — it's shown only once. Also note the
          <strong> Application ID</strong> shown after registration.
        </Callout>
      </>
    ),
  },
  {
    title: 'Enter your credentials below',
    body: (
      <p>
        Paste the <strong>Application ID</strong> and open the downloaded private key file in a text
        editor — copy the whole block (including the <code>-----BEGIN/END PRIVATE KEY-----</code> lines)
        into the <strong>Private Key</strong> field below.
      </p>
    ),
  },
  {
    title: 'Look up your Revolut institution entry',
    body: (
      <>
        <p>
          Revolut is registered per licensing country in Enable Banking's institution list. Try{' '}
          <strong>LT</strong> (Lithuania — Revolut's EU banking licence) first; if nothing shows up, try
          your own country code instead.
        </p>
        <p style={{ marginTop: '0.5rem' }}>Click a result to select it, then click <strong>Save</strong> below.</p>
      </>
    ),
  },
  {
    title: 'Connect',
    body: (
      <>
        <p>
          Click <strong>Connect to Revolut</strong> — a new tab opens for you to authorise. Once approved,
          you're redirected back here automatically and the connection completes on its own.
        </p>
        <Callout type="info">
          The banking consent lasts up to ~180 days (the bank may cap it shorter). There's no silent
          refresh — when it expires, click <strong>Reconnect</strong> to re-authorise.
        </Callout>
      </>
    ),
  },
  {
    title: 'Sync your data',
    body: (
      <>
        <ul>
          <li><strong>Sync Transactions</strong> — imports the last 90 days of transactions.</li>
          <li><strong>Sync Balance</strong> — adds today's balance as a snapshot.</li>
        </ul>
        <Callout type="info">Both syncs are idempotent — safe to run multiple times, no duplicates.</Callout>
      </>
    ),
  },
]

const BBVA_GUIDE_STEPS: { title: string; body: React.ReactNode }[] = [
  {
    title: 'Use the same Enable Banking application as Revolut',
    body: (
      <>
        <p>
          BBVA uses the same Enable Banking application — one registration connects to both banks. If
          you already set up Revolut, the <strong>Application ID</strong> and <strong>Private Key</strong>{' '}
          below are already filled in.
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          If not, follow the Revolut card's first step to register an application at{' '}
          <strong>enablebanking.com/cp</strong> (Production environment), then paste the Application ID
          and private key here.
        </p>
      </>
    ),
  },
  {
    title: 'Link BBVA in the Enable Banking control panel',
    body: (
      <p>
        In the Enable Banking control panel, link your <strong>BBVA (Italy)</strong> account to the
        application (restricted production mode only sees accounts you link yourself).
      </p>
    ),
  },
  {
    title: 'Look up your BBVA institution entry',
    body: (
      <>
        <p>
          Country code <strong>IT</strong> is pre-filled for BBVA Italy. Click <strong>Look up BBVA</strong>,
          then click the result to select it.
        </p>
        <p style={{ marginTop: '0.5rem' }}>Then click <strong>Save</strong> below.</p>
      </>
    ),
  },
  {
    title: 'Connect',
    body: (
      <>
        <p>
          Click <strong>Connect to BBVA</strong> — a new tab opens for you to authorise. Once approved,
          you're redirected back here automatically and the connection completes on its own.
        </p>
        <Callout type="info">
          The banking consent lasts up to ~180 days (the bank may cap it shorter). When it expires,
          click <strong>Reconnect</strong> to re-authorise.
        </Callout>
      </>
    ),
  },
  {
    title: 'Sync your data',
    body: (
      <>
        <ul>
          <li><strong>Sync Transactions</strong> — imports the last 90 days of transactions.</li>
          <li><strong>Sync Balance</strong> — adds today's balance as a snapshot.</li>
        </ul>
        <Callout type="info">Both syncs are idempotent — safe to run multiple times, no duplicates.</Callout>
      </>
    ),
  },
]

// ── Logos ─────────────────────────────────────────────────────────────────────

function IBLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#e8f0fe" />
      <text x="18" y="24" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1a56db">IB</text>
    </svg>
  )
}

function BinanceLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#fef3c7" />
      <text x="18" y="24" textAnchor="middle" fontSize="14" fontWeight="800" fill="#f59e0b">B</text>
    </svg>
  )
}

function RevolutLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#0e0e0e" />
      <text x="18" y="24" textAnchor="middle" fontSize="15" fontWeight="800" fill="#ffffff">R</text>
    </svg>
  )
}

function BBVALogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="9" fill="#e0e7ff" />
      <text x="18" y="23" textAnchor="middle" fontSize="10" fontWeight="800" fill="#3730a3">BBVA</text>
    </svg>
  )
}

function Callout({ children, type = 'warn' }: { children: React.ReactNode; type?: 'warn' | 'info' }) {
  const bg     = type === 'warn' ? '#fef9c3' : '#eff6ff'
  const border = type === 'warn' ? '#fbbf24' : '#93c5fd'
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 6, padding: '0.6rem 0.8rem',
      fontSize: '0.82rem', marginTop: '0.75rem', lineHeight: 1.5, color: '#1f2937',
    }}>
      {children}
    </div>
  )
}
