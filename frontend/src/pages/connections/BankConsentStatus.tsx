import type { BankLinkStatus } from '../../api/client'

export default function BankConsentStatus({ link, onRefresh }: { link: BankLinkStatus; onRefresh: () => void }) {
  if (link.status === 'not_connected') return null
  const expiry = link.valid_until ? new Date(link.valid_until) : null
  return (
    <div className="bank-consent-status" role="status">
      <div>
        {link.status === 'active' && (expiry && Number.isFinite(expiry.getTime())
          ? `Bank authorisation valid until ${expiry.toLocaleDateString()}.`
          : 'Bank authorisation is active.')}
        {link.status === 'checking' && 'Checking bank authorisation…'}
        {link.status === 'expired' && 'Bank authorisation has ended. Reconnect to renew access.'}
        {link.status === 'unknown' && 'Could not verify bank authorisation. This does not mean it has expired.'}
        {link.message && <div className="bank-consent-detail">{link.message}</div>}
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onRefresh} disabled={link.status === 'checking'}>Check connection</button>
    </div>
  )
}
