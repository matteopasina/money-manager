import { useState } from 'react'
import { api, type Account } from '../../api/client'
import ProviderCard from './ProviderCard'
import SecretField from './SecretField'
import { BinanceLogo } from './logos'
import { BINANCE_GUIDE_STEPS } from './guides'

interface Props {
  accounts: Account[]
  initial: { apiKey: string; secretSaved: boolean; accountId: number | '' }
  onMsg: (msg: { type: 'success' | 'error'; text: string }) => void
}

export default function BinanceCard({ accounts, initial, onMsg }: Props) {
  const [apiKey, setApiKey]           = useState(initial.apiKey)
  const [apiSecret, setApiSecret]     = useState('')          // write-only: blank unless replacing
  const [secretSaved, setSecretSaved] = useState(initial.secretSaved)
  const [accountId, setAccountId]     = useState<number | ''>(initial.accountId)
  const [syncing, setSyncing]         = useState<'transactions' | 'portfolio' | null>(null)
  const [saving, setSaving]           = useState(false)
  const [guideOpen, setGuideOpen]     = useState(() => !(initial.apiKey && initial.secretSaved))

  const configured = !!(apiKey && (secretSaved || apiSecret))

  async function saveSettings() {
    setSaving(true)
    try {
      const writes = [
        api.settings.set('binance_api_key', apiKey.trim()),
        api.settings.set('binance_account_id', String(accountId)),
      ]
      // Write-only secret: only send when the user typed a new one
      if (apiSecret.trim()) writes.push(api.settings.set('binance_api_secret', apiSecret.trim()))
      await Promise.all(writes)
      if (apiSecret.trim()) { setSecretSaved(true); setApiSecret('') }
      onMsg({ type: 'success', text: 'Binance settings saved.' })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSaving(false)
    }
  }

  async function sync(type: 'transactions' | 'portfolio') {
    if (!accountId) return onMsg({ type: 'error', text: 'Select an account first.' })
    setSyncing(type)
    try {
      const res = type === 'transactions'
        ? await api.binance.syncTransactions(accountId as number)
        : await api.binance.syncPortfolio(accountId as number)
      onMsg({ type: 'success', text: `Binance sync done: ${res.inserted} imported, ${res.skipped} skipped.` })
    } catch (e: unknown) {
      onMsg({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setSyncing(null)
    }
  }

  return (
    <ProviderCard
      logo={<BinanceLogo />}
      name="Binance"
      description="Import deposits, withdrawals, converts, earn rewards, and daily portfolio value via the Binance API."
      connected={false}
      statusLabel={configured ? 'Credentials saved' : 'Not configured'}
      guideOpen={guideOpen}
      onToggleGuide={() => setGuideOpen(o => !o)}
      guideSteps={BINANCE_GUIDE_STEPS}
    >
      <div className="form-group">
        <label>API Key</label>
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Your Binance API key" />
      </div>
      <SecretField
        label="API Secret"
        value={apiSecret}
        onChange={setApiSecret}
        saved={secretSaved}
        placeholder="Your Binance API secret"
        noun="secret"
      />
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
        <button className="btn btn-primary" onClick={() => sync('portfolio')} disabled={syncing !== null}>
          {syncing === 'portfolio' ? 'Syncing…' : 'Sync Portfolio'}
        </button>
      </div>
    </ProviderCard>
  )
}
