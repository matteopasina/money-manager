import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { Account } from '../api/client'
import LoadingSpinner from '../components/LoadingSpinner'
import Alert from '../components/Alert'

export default function Connections() {
  const [loading, setLoading]     = useState(true)
  const [accounts, setAccounts]   = useState<Account[]>([])
  const [msg, setMsg]             = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // IB state
  const [ibToken, setIbToken]     = useState('')
  const [ibTxnQid, setIbTxnQid]   = useState('')
  const [ibNavQid, setIbNavQid]   = useState('')
  const [ibAccountId, setIbAccountId] = useState<number | ''>('')
  const [ibSyncing, setIbSyncing] = useState<'transactions' | 'nav' | null>(null)
  const [ibSaving, setIbSaving]   = useState(false)
  const [ibGuideOpen, setIbGuideOpen] = useState(false)

  // Binance state
  const [bnApiKey, setBnApiKey]       = useState('')
  const [bnApiSecret, setBnApiSecret] = useState('')
  const [bnAccountId, setBnAccountId] = useState<number | ''>('')
  const [bnSyncing, setBnSyncing]     = useState<'transactions' | 'portfolio' | null>(null)
  const [bnSaving, setBnSaving]       = useState(false)
  const [bnGuideOpen, setBnGuideOpen] = useState(false)

  // BBVA state
  const [bbvaAppId, setBbvaAppId]               = useState('')
  const [bbvaSecret, setBbvaSecret]             = useState('')
  const [bbvaAccountId, setBbvaAccountId]       = useState<number | ''>('')
  const [bbvaConnected, setBbvaConnected]       = useState(false)
  const [bbvaConnectUrl, setBbvaConnectUrl]     = useState('')
  const [bbvaSeAccounts, setBbvaSeAccounts]     = useState<{ id: string; name: string; currency: string }[]>([])
  const [bbvaSaving, setBbvaSaving]             = useState(false)
  const [bbvaCreatingCustomer, setBbvaCreatingCustomer] = useState(false)
  const [bbvaConnecting, setBbvaConnecting]     = useState(false)
  const [bbvaCheckingStatus, setBbvaCheckingStatus] = useState(false)
  const [bbvaSyncing, setBbvaSyncing]           = useState<'transactions' | 'balances' | null>(null)

  useEffect(() => {
    Promise.all([
      api.settings.all(),
      api.accounts.list(),
    ]).then(([s, accs]) => {
      setAccounts(accs)

      const token = s.ib_token || '', txnQid = s.ib_transactions_query_id || '', navQid = s.ib_nav_query_id || ''
      setIbToken(token)
      setIbTxnQid(txnQid)
      setIbNavQid(navQid)
      setIbGuideOpen(!(token && txnQid && navQid))
      if (s.ib_account_id) setIbAccountId(Number(s.ib_account_id))
      else if (accs.length > 0) setIbAccountId(accs[0].id)

      const bnKey = s.binance_api_key || '', bnSecret = s.binance_api_secret || ''
      setBnApiKey(bnKey)
      setBnApiSecret(bnSecret)
      setBnGuideOpen(!(bnKey && bnSecret))
      if (s.binance_account_id) setBnAccountId(Number(s.binance_account_id))
      else if (accs.length > 0) setBnAccountId(accs[0].id)

      setBbvaAppId(s.bbva_se_app_id || '')
      setBbvaSecret(s.bbva_se_secret || '')
      setBbvaConnected(!!s.bbva_se_account_id)
      if (s.bbva_account_id) setBbvaAccountId(Number(s.bbva_account_id))
      else if (accs.length > 0) setBbvaAccountId(accs[0].id)
    }).finally(() => setLoading(false))
  }, [])

  async function saveIbSettings() {
    setIbSaving(true)
    try {
      await Promise.all([
        api.settings.set('ib_token', ibToken.trim()),
        api.settings.set('ib_transactions_query_id', ibTxnQid.trim()),
        api.settings.set('ib_nav_query_id', ibNavQid.trim()),
        api.settings.set('ib_account_id', String(ibAccountId)),
      ])
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
      await Promise.all([
        api.settings.set('binance_api_key', bnApiKey.trim()),
        api.settings.set('binance_api_secret', bnApiSecret.trim()),
        api.settings.set('binance_account_id', String(bnAccountId)),
      ])
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

  async function saveBbvaSettings() {
    setBbvaSaving(true)
    try {
      await Promise.all([
        api.settings.set('bbva_se_app_id', bbvaAppId.trim()),
        api.settings.set('bbva_se_secret', bbvaSecret.trim()),
        api.settings.set('bbva_account_id', String(bbvaAccountId)),
      ])
      setMsg({ type: 'success', text: 'BBVA settings saved.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaSaving(false)
    }
  }

  async function bbvaCreateCustomer() {
    setBbvaCreatingCustomer(true)
    try {
      const res = await api.bbva.createCustomer()
      setMsg({ type: 'success', text: res.note ? `Customer already exists (${res.customer_id})` : `Customer created: ${res.customer_id}` })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaCreatingCustomer(false)
    }
  }

  async function bbvaConnect() {
    setBbvaConnecting(true)
    setBbvaConnectUrl('')
    try {
      const res = await api.bbva.connect()
      setBbvaConnectUrl(res.connect_url)
      setMsg({ type: 'success', text: 'Link created — open it in your browser to authorise BBVA.' })
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaConnecting(false)
    }
  }

  async function bbvaCheckStatus() {
    setBbvaCheckingStatus(true)
    try {
      const res = await api.bbva.linkStatus()
      if (res.status === 'active' || res.status === 'connected') {
        setBbvaConnected(true)
        setBbvaSeAccounts(res.accounts ?? [])
        setMsg({ type: 'success', text: 'BBVA connected successfully!' })
      } else {
        setMsg({ type: 'error', text: `Status: ${res.status} — complete authorisation in the browser first.` })
      }
    } catch (e: unknown) {
      setMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBbvaCheckingStatus(false)
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

  const ibConfigured = !!(ibToken && ibTxnQid && ibNavQid)
  const bnConfigured = !!(bnApiKey && bnApiSecret)

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
              placeholder="Your IB Flex token"
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
              placeholder="Your Binance API secret"
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

        {/* ── BBVA ────────────────────────────────────────────────────────── */}
        <ProviderCard
          logo={<BBVALogo />}
          name="BBVA"
          description="Connect via the Saltedge open-banking API."
          connected={bbvaConnected}
        >
          <Alert type="warning" style={{ marginBottom: '1rem' }}>
            Saltedge requires a registered <strong>business</strong> account — it isn't available to
            individual developers, so this connection won't work yet. Looking for a free
            personal-developer-friendly provider as an alternative.
          </Alert>

          <div className="form-group">
            <label>App ID</label>
            <input value={bbvaAppId} onChange={e => setBbvaAppId(e.target.value)} placeholder="Your Saltedge App ID" />
          </div>
          <div className="form-group">
            <label>Secret</label>
            <input
              type="password"
              value={bbvaSecret}
              onChange={e => setBbvaSecret(e.target.value)}
              placeholder="Your Saltedge Secret"
              autoComplete="new-password"
            />
          </div>
          <div className="form-group">
            <label>Import into account</label>
            <select value={bbvaAccountId} onChange={e => setBbvaAccountId(Number(e.target.value))}>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <button className="btn btn-secondary" onClick={saveBbvaSettings} disabled={bbvaSaving}>
              {bbvaSaving ? 'Saving…' : 'Save settings'}
            </button>
            <button className="btn btn-secondary" onClick={bbvaCreateCustomer} disabled={bbvaCreatingCustomer}>
              {bbvaCreatingCustomer ? 'Creating…' : 'Create customer'}
            </button>
          </div>

          {!bbvaConnected ? (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn btn-primary" onClick={bbvaConnect} disabled={bbvaConnecting}>
                {bbvaConnecting ? 'Connecting…' : 'Connect to BBVA'}
              </button>
              {bbvaConnectUrl && (
                <>
                  <a href={bbvaConnectUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                    Open authorisation link ↗
                  </a>
                  <button className="btn btn-secondary" onClick={bbvaCheckStatus} disabled={bbvaCheckingStatus}>
                    {bbvaCheckingStatus ? 'Checking…' : 'Check status'}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ color: 'var(--gain)', fontWeight: 600, fontSize: '0.85rem' }}>✓ Connected</span>
                <button className="btn btn-secondary" onClick={() => { setBbvaConnected(false); setBbvaConnectUrl('') }}>
                  Reconnect
                </button>
              </div>
              {bbvaSeAccounts.length > 0 && (
                <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
                  Accounts: {bbvaSeAccounts.map(a => `${a.name} (${a.currency})`).join(', ')}
                </p>
              )}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" onClick={() => bbvaSync('transactions')} disabled={bbvaSyncing !== null}>
                  {bbvaSyncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
                </button>
                <button className="btn btn-primary" onClick={() => bbvaSync('balances')} disabled={bbvaSyncing !== null}>
                  {bbvaSyncing === 'balances' ? 'Syncing…' : 'Sync Balance'}
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
