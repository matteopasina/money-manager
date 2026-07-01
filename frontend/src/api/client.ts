const BASE = '/api'

// Placeholder the backend returns for saved secrets (API keys, tokens, private
// keys) instead of their real values — secrets are write-only from the browser.
export const SECRET_MASK = '__secret__'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status} ${res.statusText}: ${text}`)
  }
  return res.json()
}

export const api = {
  // Accounts
  accounts: {
    list: (activeOnly = false) =>
      request<Account[]>(`/accounts?active_only=${activeOnly}`),
    create: (body: { name: string; currency: string; account_type: string }) =>
      request<Account>('/accounts', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: Partial<Account>) =>
      request<void>(`/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    fxRates: () => request<FxRate[]>('/accounts/fx-rates'),
    upsertFxRate: (currency: string, rate: number) =>
      request<void>(`/accounts/fx-rates/${currency}`, {
        method: 'PUT', body: JSON.stringify({ rate }),
      }),
  },

  // Balances
  balances: {
    list: () => request<BalanceRow[]>('/balances'),
    create: (body: BalanceIn) =>
      request<void>('/balances', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: { amount_native: number; amount_base: number }) =>
      request<void>(`/balances/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/balances/${id}`, { method: 'DELETE' }),
  },

  // Transactions
  transactions: {
    list: (params: { account_id?: number; start?: string; end?: string } = {}) => {
      const q = new URLSearchParams()
      if (params.account_id) q.set('account_id', String(params.account_id))
      if (params.start) q.set('start', params.start)
      if (params.end) q.set('end', params.end)
      return request<TransactionRow[]>(`/transactions?${q}`)
    },
    updateCategory: (id: number, category: string) =>
      request<void>(`/transactions/${id}/category`, {
        method: 'PATCH', body: JSON.stringify({ category }),
      }),
    monthlySpend: (months = 6) =>
      request<{ monthly_spend: number }>(`/transactions/monthly-spend?months=${months}`),
    avgIncome: () =>
      request<{ mean: number; median: number }>('/transactions/avg-income'),
  },

  // Categories
  categories: {
    list: () => request<Category[]>('/categories'),
    create: (body: CategoryIn) =>
      request<Category>('/categories', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: number, body: CategoryIn) =>
      request<void>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: number) =>
      request<void>(`/categories/${id}`, { method: 'DELETE' }),
    rules: {
      list: () => request<KeywordRule[]>('/categories/rules'),
      create: (body: KeywordRuleIn) =>
        request<KeywordRule>('/categories/rules', { method: 'POST', body: JSON.stringify(body) }),
      update: (id: number, body: KeywordRuleIn) =>
        request<void>(`/categories/rules/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
      delete: (id: number) =>
        request<void>(`/categories/rules/${id}`, { method: 'DELETE' }),
      reapply: () =>
        request<{ updated: number }>('/categories/rules/reapply', { method: 'POST' }),
      seedDefaults: () =>
        request<{ inserted: number; skipped: number }>('/categories/rules/seed-defaults', { method: 'POST' }),
    },
  },

  // Settings
  settings: {
    all: () => request<Record<string, string>>('/settings'),
    set: (key: string, value: string) =>
      request<void>(`/settings/${key}`, { method: 'PUT', body: JSON.stringify({ value }) }),
  },

  // Import
  import: {
    adapters: () => request<AdapterInfo[]>('/import/adapters'),
    preview: (formData: FormData) =>
      fetch(BASE + '/import/preview', { method: 'POST', body: formData }).then(r => r.json()),
    confirm: (formData: FormData) =>
      fetch(BASE + '/import/confirm', { method: 'POST', body: formData }).then(r => r.json()),
  },

  // Analytics
  analytics: {
    forecast: (monthsAhead = 12) =>
      request<ForecastResult>(`/analytics/forecast?months_ahead=${monthsAhead}`),
    fire: (body: FireParams) =>
      request<FireResult>('/analytics/fire', { method: 'POST', body: JSON.stringify(body) }),
    accountReturns: () =>
      request<AccountReturnsResult>('/analytics/account-returns'),
  },

  // BBVA live sync via Enable Banking
  bbva: {
    aspsps: (country = 'IT', search = 'bbva') =>
      request<{ name: string; country: string }[]>(`/bbva/aspsps?country=${country}&search=${encodeURIComponent(search)}`),
    connect: (redirectUri?: string) =>
      request<{ url: string }>(
        `/bbva/connect${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`,
        { method: 'POST' }
      ),
    exchangeCode: (code: string) =>
      request<{ session_id: string; accounts: { uid: string; name: string; currency: string }[] }>(
        `/bbva/exchange-code?code=${encodeURIComponent(code)}`, { method: 'POST' }
      ),
    linkStatus: () =>
      request<{ status: string; account_uid?: string; account_count?: number }>('/bbva/link-status'),
    syncTransactions: (accountId: number, days = 90) =>
      request<{ inserted: number; skipped: number }>(
        `/bbva/sync/transactions?account_id=${accountId}&days=${days}`, { method: 'POST' }
      ),
    syncBalances: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/bbva/sync/balances?account_id=${accountId}`, { method: 'POST' }
      ),
  },

  // Revolut live sync via Enable Banking
  revolut: {
    aspsps: (country = 'LT', search = 'revolut') =>
      request<{ name: string; country: string }[]>(`/revolut/aspsps?country=${country}&search=${encodeURIComponent(search)}`),
    connect: (redirectUri?: string) =>
      request<{ url: string }>(
        `/revolut/connect${redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : ''}`,
        { method: 'POST' }
      ),
    exchangeCode: (code: string) =>
      request<{ session_id: string; accounts: { uid: string; name: string; currency: string }[] }>(
        `/revolut/exchange-code?code=${encodeURIComponent(code)}`, { method: 'POST' }
      ),
    linkStatus: () =>
      request<{ status: string; accounts?: { uid: string; name: string; currency: string }[] }>('/revolut/link-status'),
    syncTransactions: (accountId: number, days = 90) =>
      request<{ inserted: number; skipped: number }>(
        `/revolut/sync/transactions?account_id=${accountId}&days=${days}`, { method: 'POST' }
      ),
    syncBalances: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/revolut/sync/balances?account_id=${accountId}`, { method: 'POST' }
      ),
  },

  // Binance live sync
  binance: {
    syncTransactions: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/binance/sync/transactions?account_id=${accountId}`, { method: 'POST' }
      ),
    syncPortfolio: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/binance/sync/portfolio?account_id=${accountId}`, { method: 'POST' }
      ),
  },

  // Interactive Brokers live sync
  ib: {
    syncTransactions: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/ib/sync/transactions?account_id=${accountId}`, { method: 'POST' }
      ),
    syncNav: (accountId: number) =>
      request<{ inserted: number; skipped: number }>(
        `/ib/sync/nav?account_id=${accountId}`, { method: 'POST' }
      ),
  },

  // Automatic sync (scheduler status + controls)
  sync: {
    status: () => request<SyncStatus>('/sync/status'),
    runNow: () => request<SyncStatus>('/sync/run-now', { method: 'POST' }),
    updateSettings: (enabled: boolean, intervalHours: number) =>
      request<void>('/sync/settings', {
        method: 'PUT', body: JSON.stringify({ enabled, interval_hours: intervalHours }),
      }),
  },

  // Chat
  chat: (body: { messages: ChatMessage[]; model: string; page_context?: string }) =>
    request<{ reply: string; messages: ChatMessage[] }>('/chat', {
      method: 'POST', body: JSON.stringify(body),
    }),
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Account {
  id: number
  name: string
  currency: string
  account_type: string
  active: boolean
}

export interface FxRate {
  currency: string
  rate_to_base: number
  updated_at: string
}

export interface BalanceRow {
  id: number
  date: string
  amount_native: number
  amount_base: number
  account_id: number
  account: string
  currency: string
  account_type: string
}

export interface BalanceIn {
  account_id: number
  date: string
  amount_native: number
  amount_base: number
}

export interface TransactionRow {
  id: number
  date: string
  value_date: string | null
  description: string
  reference: string | null
  amount: number
  amount_base: number | null
  balance: number | null
  notes: string | null
  category: string | null
  account: string
  account_id: number
}

export interface Category {
  id: number
  name: string
  color: string
  is_income: boolean
  is_transfer: boolean
}

export interface CategoryIn {
  name: string
  color: string
  is_income: boolean
  is_transfer: boolean
}

export interface KeywordRule {
  id: number
  keyword: string
  category_name: string
  match_field: string
  priority: number
}

export interface KeywordRuleIn {
  keyword: string
  category_name: string
  match_field: string
  priority: number
}

export interface AdapterInfo {
  name: string
  file_types: string[]
  imports: string
}

export interface ForecastResult {
  historical: { date: string; amount: number }[]
  forecast: { date: string; amount: number }[]
  monthly_growth: number
  currency: string
}

export interface FireParams {
  target_amount: number
  annual_return_pct?: number
  monthly_contribution?: number
  withdrawal_rate_pct?: number
  monthly_expenses?: number
}

export interface FireResult {
  current_nw: number
  monthly_contribution: number
  fire_number: number
  target_amount: number
  months_to_target: number | null
  years_to_target: number | null
  projection: { date: string; amount: number }[]
  currency: string
  detected_income?: number
  detected_expenses?: number
  detected_return_pct?: number | null
}

export interface AccountReturnsResult {
  accounts: {
    account: string
    account_type: string
    current_balance: number
    annual_return_pct: number
    monthly_return_pct: number
    data_points: number
    first_date: string
    latest_date: string
  }[]
  by_type: {
    account_type: string
    total_balance: number
    annual_return_pct: number
  }[]
  weighted_annual_return_pct: number
  currency: string
}

export interface SyncIntegrationStatus {
  id: string
  name: string
  configured: boolean
  last_status: 'success' | 'error' | null
  last_message: string | null
  last_run_at: string | null
  last_success_at: string | null
  due: boolean
}

export interface SyncStatus {
  enabled: boolean
  interval_hours: number
  integrations: SyncIntegrationStatus[]
  results?: { id: string; name: string; result: string; message?: string }[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  tool_calls?: unknown[]
  tool_call_id?: string
}
