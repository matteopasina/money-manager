import type { Account } from '../../api/client'

// Prefer the account id already saved in settings; otherwise default to the
// first account so the dropdown isn't left empty on a fresh setup.
export function initialAccountId(accounts: Account[], saved: string | undefined): number | '' {
  if (saved) return Number(saved)
  return accounts.length > 0 ? accounts[0].id : ''
}

export function relTime(iso: string | null): string {
  if (!iso) return 'never'
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}
