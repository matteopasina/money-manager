export interface GuideStep {
  title: string
  body: React.ReactNode
}

interface Props {
  logo: React.ReactNode
  name: string
  description: string
  connected: boolean
  statusLabel?: string
  guideSteps?: GuideStep[]
  guideOpen?: boolean
  onToggleGuide?: () => void
  children: React.ReactNode
}

export default function ProviderCard({
  logo, name, description, connected, statusLabel, guideSteps, guideOpen, onToggleGuide, children,
}: Props) {
  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ flexShrink: 0 }}>{logo}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>{name}</div>
          <div style={{ fontSize: '11.5px', color: 'var(--ink-faint)', overflowWrap: 'anywhere' }}>
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
          {statusLabel ?? (connected ? 'Connected' : 'Not connected')}
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
