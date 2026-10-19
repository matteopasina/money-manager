import { useState } from 'react'
import { api, type Account } from '../../api/client'
import ProviderCard from './ProviderCard'
import SecretField from './SecretField'
import { IBLogo } from './logos'
import { IB_GUIDE_STEPS } from './guides'

interface Props {
  accounts: Account[]
  initial: { tokenSaved: boolean; txnQid: string; navQid: string; accountId: number | '' }
  onMsg: (msg: { type: 'success' | 'error'; text: string }) => void
}

export default function IBCard({ accounts, initial, onMsg }: Props) {
  const [token, setToken]           = useState('')          // write-only: blank unless replacing
  const [tokenSaved, setTokenSaved] = useState(initial.tokenSaved)
  const [txnQid, setTxnQid]         = useState(initial.txnQid)
  const [navQid, setNavQid]         = useState(initial.navQid)
  const [accountId, setAccountId]   = useState<number | ''>(initial.accountId)
  const [syncing, setSyncing]       = useState<'transactions' | 'nav' | null>(null)
  const [saving, setSaving]         = useState(false)
  const [guideOpen, setGuideOpen]   = useState(() => !(initial.tokenSaved && initial.txnQid && initial.navQid))

  const configured = !!((tokenSaved || token) && txnQid && navQid)

  async function saveSettings() {
    setSaving(true)
    try {
      const writes = [
        api.settings.set('ib_transactions_query_id', txnQid.trim()),
        api.settings.set('ib_nav_query_id', navQid.trim()),
        api.settings.set('ib_account_id', String(accountId)),
      ]
      // Write-only secret: only send when the user typed a new one
      if (token.trim()) writes.push(api.settings.set('ib_token', token.trim()))
      await Promise.all(writes)
      if (token.trim()) { setTokenSaved(true); setToken('') }
      onMsg({ type: 'success', text: 'IB settings saved.' })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function sync(type: 'transactions' | 'nav') {
    if (!accountId) return onMsg({ type: 'error', text: 'Select an account first.' })
    setSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.ib.syncTransactions(accountId as number)
        : await api.ib.syncNav(accountId as number)
      onMsg({ type: 'success', text: `IB sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(null)
    }
  }

  return (
    <ProviderCard
      logo={<IBLogo />}
      name="Interactive Brokers"
      description="Import trades, cash transactions, dividends, and daily portfolio value via Flex Query."
      connected={false}
      statusLabel={configured ? 'Configured' : 'Not configured'}
      guideOpen={guideOpen}
      onToggleGuide={() => setGuideOpen(o => !o)}
      guideSteps={IB_GUIDE_STEPS}
    >
      <SecretField
        label="Flex Web Service Token"
        value={token}
        onChange={setToken}
        saved={tokenSaved}
        placeholder="Your IB Flex token"
        noun="token"
      />
      <div className="form-group">
        <label>Transactions Query ID</label>
        <input value={txnQid} onChange={e => setTxnQid(e.target.value)} placeholder="e.g. 123456" />
      </div>
      <div className="form-group">
        <label>NAV Query ID</label>
        <input value={navQid} onChange={e => setNavQid(e.target.value)} placeholder="e.g. 789012" />
      </div>
      <div className="form-group">
        <label>Import into account</label>
        <select value={accountId} onChange={e => setAccountId(Number(e.target.value))}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" onClick={saveSettings} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button className="btn btn-primary" onClick={() => sync('transactions')} disabled={syncing !== null}>
          {syncing === 'transactions' ? 'Syncing…' : 'Sync Transactions'}
        </button>
        <button className="btn btn-primary" onClick={() => sync('nav')} disabled={syncing !== null}>
          {syncing === 'nav' ? 'Syncing…' : 'Sync NAV'}
        </button>
      </div>
    </ProviderCard>
  )
}
