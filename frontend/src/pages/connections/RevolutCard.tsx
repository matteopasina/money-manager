import { useState } from 'react'
import { api, type Account } from '../../api/client'
import ProviderCard from './ProviderCard'
import { RevolutLogo } from './logos'
import { REVOLUT_GUIDE_STEPS } from './guides'

interface Props {
  accounts: Account[]
  initial: { aspspName: string; aspspCountry: string; accountId: number | '' }
  connected: boolean
  ebAccounts: { uid: string; name: string; currency: string }[]
  ebAppId: string
  setEbAppId: (v: string) => void
  ebPrivateKey: string
  setEbPrivateKey: (v: string) => void
  ebKeySaved: boolean
  saveEbCredentials: () => Promise<boolean>
  onMsg: (msg: { type: 'success' | 'error'; text: string }) => void
}

export default function RevolutCard({
  accounts, initial, connected, ebAccounts, ebAppId, setEbAppId, ebPrivateKey, setEbPrivateKey, ebKeySaved,
  saveEbCredentials, onMsg,
}: Props) {
  const [accountId, setAccountId]         = useState<number | ''>(initial.accountId)
  const [aspspName, setAspspName]         = useState(initial.aspspName)
  const [aspspCountry, setAspspCountry]   = useState(initial.aspspCountry)
  const [lookupCountry, setLookupCountry] = useState('LT')
  const [aspspOptions, setAspspOptions]   = useState<{ name: string; country: string }[]>([])
  const [saving, setSaving]         = useState(false)
  const [lookingUp, setLookingUp]   = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing]       = useState<'transactions' | 'balances' | null>(null)
  const [guideOpen, setGuideOpen]   = useState(() => !connected)

  async function lookup() {
    setLookingUp(true)
    try {
      // Persist credentials first — the lookup calls Enable Banking, which needs them server-side.
      if (!(await saveEbCredentials())) return
      const list = await api.revolut.aspsps(lookupCountry)
      setAspspOptions(list)
      if (list.length === 0) {
        onMsg({ type: 'error', text: `No Revolut entry found for country ${lookupCountry}. Try a different country code (e.g. LT, GB, IE).` })
      }
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setLookingUp(false)
    }
  }

  async function saveSettings() {
    setSaving(true)
    try {
      if (!(await saveEbCredentials())) return
      await Promise.all([
        api.settings.set('revolut_eb_aspsp_name', aspspName.trim()),
        api.settings.set('revolut_eb_aspsp_country', aspspCountry.trim()),
        api.settings.set('revolut_account_id', String(accountId)),
      ])
      onMsg({ type: 'success', text: 'Revolut settings saved.' })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function connect() {
    setConnecting(true)
    try {
      const res = await api.revolut.connect()
      window.open(res.url, '_blank')
      onMsg({ type: 'success', text: 'Authorisation opened in a new tab — approve it there, then come back here.' })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setConnecting(false)
    }
  }

  async function sync(type: 'transactions' | 'balances') {
    if (!accountId) return onMsg({ type: 'error', text: 'Select an account first.' })
    setSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.revolut.syncTransactions(accountId as number)
        : await api.revolut.syncBalances(accountId as number)
      onMsg({ type: 'success', text: `Revolut sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(null)
    }
  }

  return (
    <ProviderCard
      logo={<RevolutLogo />}
      name="Revolut"
      description="Import transactions and balance via the Enable Banking open-banking API."
      connected={connected}
      guideOpen={guideOpen}
      onToggleGuide={() => setGuideOpen(o => !o)}
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
            value={lookupCountry}
            onChange={e => setLookupCountry(e.target.value.toUpperCase())}
            placeholder="Country code, e.g. LT"
            style={{ maxWidth: 160 }}
          />
          <button className="btn btn-secondary" onClick={lookup} disabled={lookingUp} style={{ whiteSpace: 'nowrap' }}>
            {lookingUp ? 'Looking up…' : 'Look up Revolut'}
          </button>
        </div>
        {aspspOptions.length > 0 && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            {aspspOptions.map(opt => (
              <div
                key={`${opt.name}-${opt.country}`}
                style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                onClick={() => { setAspspName(opt.name); setAspspCountry(opt.country); setAspspOptions([]) }}
              >
                <strong>{opt.name}</strong> <span style={{ color: 'var(--ink-faint)' }}>{opt.country}</span>
              </div>
            ))}
          </div>
        )}
        {aspspName && (
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-faint)', marginTop: '0.4rem' }}>
            Selected: <strong>{aspspName}</strong> ({aspspCountry})
          </p>
        )}
      </div>

      <div className="form-group">
        <label>Import into account</label>
        <select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: connected ? '1rem' : 0 }}>
        <button className="btn btn-secondary" onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        {!connected && (
          <button className="btn btn-primary" onClick={connect} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect to Revolut'}
          </button>
        )}
      </div>

      {connected && (
        <div style={{ marginTop: '1rem' }}>
          {ebAccounts.length > 0 && (
            <p style={{ fontSize: '0.8rem', color: 'var(--ink-faint)', marginBottom: '0.75rem' }}>
              Accounts: {ebAccounts.map(a => `${a.name} (${a.currency})`).join(', ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => sync('transactions')} disabled={syncing !== null}>
              {syncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
            </button>
            <button className="btn btn-primary" onClick={() => sync('balances')} disabled={syncing !== null}>
              {syncing === 'balances' ? 'Syncing…' : 'Sync Balance'}
            </button>
            <button className="btn btn-secondary" onClick={connect} disabled={connecting}>
              {connecting ? 'Connecting…' : 'Reconnect'}
            </button>
          </div>
        </div>
      )}
    </ProviderCard>
  )
}
