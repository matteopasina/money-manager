import { useState } from 'react'

type Integration = {
  id: string
  name: string
  logo: React.ReactNode
  description: string
  steps: { title: string; body: React.ReactNode }[]
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'ib',
    name: 'Interactive Brokers',
    logo: <IBLogo />,
    description: 'Import trades, cash transactions, dividends, and daily portfolio value via Flex Query.',
    steps: [
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
              <li>Save — you will select this account later in Settings.</li>
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
              <li>
                Log in to <strong>IB Account Management</strong> (
                <code>myaccount.ibkr.com</code> or the Client Portal).
              </li>
              <li>Navigate to <strong>Reports → Settings</strong>.</li>
              <li>
                Scroll to <strong>Flex Web Service</strong> and click{' '}
                <strong>Generate Token</strong> (or copy an existing one).
              </li>
              <li>Copy the token — paste it into Settings later.</li>
            </ol>
            <Callout>Keep the token secret — it grants read access to your IB activity reports.</Callout>
          </>
        ),
      },
      {
        title: 'Create the Transactions Flex Query',
        body: (
          <>
            <p>
              This query fetches cash movements (deposits, withdrawals, dividends, interest,
              commissions) and optionally trade history.
            </p>
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
              <li>
                Choose a <strong>Date Range</strong> (e.g. <em>Last 365 Calendar Days</em>).
              </li>
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
              <li>
                Under <strong>Sections</strong>, enable:{' '}
                <strong>Net Asset Value (NAV) in Base</strong> — tick{' '}
                <em>Select All</em>.
              </li>
              <li>Set <strong>Format</strong> to <em>XML</em>.</li>
              <li>Choose a date range and click <strong>Save</strong>. Note the Query ID.</li>
            </ol>
            <Callout type="info">
              IB already converts the NAV to your base currency, so no manual FX conversion is needed.
            </Callout>
          </>
        ),
      },
      {
        title: 'Configure in Settings',
        body: (
          <>
            <ol>
              <li>Open <strong>Settings</strong> in the sidebar.</li>
              <li>Find the <strong>Interactive Brokers</strong> card.</li>
              <li>Paste your <strong>Flex Web Service Token</strong>.</li>
              <li>Paste the <strong>Transactions Query ID</strong> and <strong>NAV Query ID</strong>.</li>
              <li>Select the IB account you created in step 1.</li>
              <li>Click <strong>Save IB settings</strong>.</li>
            </ol>
          </>
        ),
      },
      {
        title: 'Sync your data',
        body: (
          <>
            <p>Back in <strong>Settings → Interactive Brokers</strong>:</p>
            <ul>
              <li>
                <strong>Sync Transactions</strong> — imports cash flows and trades. Shows how
                many rows were added vs. skipped as duplicates.
              </li>
              <li>
                <strong>Sync NAV</strong> — imports daily portfolio values shown in Dashboard
                balance charts.
              </li>
            </ul>
            <Callout type="info">
              Both syncs are <strong>idempotent</strong> — safe to run multiple times, no duplicates created.
            </Callout>
            <p style={{ marginTop: '0.75rem' }}>
              After syncing, visit <strong>Transactions</strong> to review and categorise entries,
              or set up keyword rules under <strong>Categories</strong> to auto-categorise future syncs.
            </p>
          </>
        ),
      },
    ],
  },
]

export default function Integrations() {
  const [open, setOpen] = useState<string | null>('ib')

  return (
    <div>
      <div className="page-header">
        <h1>Integrations</h1>
        <p>Connect external accounts to import data automatically.</p>
      </div>

      <div style={{ maxWidth: 660, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {INTEGRATIONS.map(integration => (
          <div key={integration.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header row — click to expand/collapse */}
            <button
              onClick={() => setOpen(open === integration.id ? null : integration.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '1rem',
                width: '100%', padding: '1rem 1.25rem',
                background: 'none', border: 'none', cursor: 'pointer',
                textAlign: 'left', color: 'var(--text)',
              }}
            >
              <div style={{ flexShrink: 0 }}>{integration.logo}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{integration.name}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {integration.description}
                </div>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                {open === integration.id ? '▲ Hide guide' : '▼ Setup guide'}
              </span>
            </button>

            {/* Expanded step-by-step guide */}
            {open === integration.id && (
              <div style={{ padding: '0 1.25rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                <div style={{ paddingTop: '1.25rem' }}>
                  {integration.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
                      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{
                          width: 28, height: 28, borderRadius: '50%',
                          background: 'var(--accent)', color: '#fff',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                        }}>
                          {i + 1}
                        </div>
                        {i < integration.steps.length - 1 && (
                          <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 16, marginTop: 4 }} />
                        )}
                      </div>
                      <div style={{ flex: 1, paddingTop: 2 }}>
                        <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: '0.9rem' }}>
                          {step.title}
                        </div>
                        <div style={{ fontSize: '0.85rem', lineHeight: 1.65, color: 'var(--text)' }}>
                          {step.body}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Placeholder cards for future integrations */}
        {[
          { name: 'Binance', desc: 'Import spot trades and earn history.' },
          { name: 'Crypto.com', desc: 'Import transactions from the Crypto.com app.' },
        ].map(item => (
          <div key={item.name} className="card" style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            opacity: 0.5, padding: '1rem 1.25rem',
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: 'var(--border)', flexShrink: 0,
            }} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.2rem' }}>{item.name}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Coming soon
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function IBLogo() {
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="8" fill="#e8f0fe"/>
      <text x="18" y="24" textAnchor="middle" fontSize="14" fontWeight="800" fill="#1a56db">IB</text>
    </svg>
  )
}

function Callout({
  children,
  type = 'warn',
}: {
  children: React.ReactNode
  type?: 'warn' | 'info'
}) {
  const bg     = type === 'warn' ? '#fef9c3' : '#eff6ff'
  const border = type === 'warn' ? '#fbbf24' : '#93c5fd'
  return (
    <div style={{
      background: bg, border: `1px solid ${border}`,
      borderRadius: 6, padding: '0.6rem 0.8rem',
      fontSize: '0.82rem', marginTop: '0.75rem', lineHeight: 1.5,
    }}>
      {children}
    </div>
  )
}
