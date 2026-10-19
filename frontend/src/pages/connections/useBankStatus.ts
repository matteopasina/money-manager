import { useCallback, useEffect, useState } from 'react'
import { api, type BankLinkStatus } from '../../api/client'

export function useBankStatus(provider: 'bbva' | 'revolut', connected: boolean) {
  const [status, setStatus] = useState<BankLinkStatus>({ status: 'checking' })
  const load = useCallback(() => api[provider].linkStatus().catch((error: unknown): BankLinkStatus => ({
    status: 'unknown', message: error instanceof Error ? error.message : 'Could not verify the bank connection.',
  })), [provider])

  useEffect(() => {
    if (!connected) return
    let cancelled = false
    load().then(result => { if (!cancelled) setStatus(result) })
    return () => { cancelled = true }
  }, [connected, load])

  async function refresh() {
    setStatus({ status: 'checking' })
    setStatus(await load())
  }
  return { link: connected ? status : { status: 'not_connected' as const }, refresh }
}

export function bankStatusLabel(status: BankLinkStatus['status']) {
  return { active: 'Connected', checking: 'Checking…', expired: 'Reconnect required', unknown: 'Check unavailable', not_connected: 'Not connected' }[status]
}
