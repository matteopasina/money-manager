import { useState } from 'react'
import Accounts from '../Accounts'
import Balances from '../Balances'

export default function WealthAccounts() {
  const [accountsVersion, setAccountsVersion] = useState(0)
  return <div className="workspace-stack"><Accounts embedded onAccountsChange={() => setAccountsVersion(v => v + 1)} /><Balances embedded accountsVersion={accountsVersion} /></div>
}
