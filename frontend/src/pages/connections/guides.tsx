import Callout from './Callout'
import type { GuideStep } from './ProviderCard'

export const IB_GUIDE_STEPS: GuideStep[] = [
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

export const BINANCE_GUIDE_STEPS: GuideStep[] = [
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

export const REVOLUT_GUIDE_STEPS: GuideStep[] = [
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

export const BBVA_GUIDE_STEPS: GuideStep[] = [
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
