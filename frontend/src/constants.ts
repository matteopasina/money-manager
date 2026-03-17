export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK', 'JPY', 'CAD', 'AUD']

export const ACCOUNT_TYPES = ['liquid', 'stocks', 'crypto', 'pension', 'real estate', 'other']

export const ACCOUNT_TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  liquid:        { bg: '#dbeafe', color: '#1d4ed8' },
  stocks:        { bg: '#dcfce7', color: '#15803d' },
  crypto:        { bg: '#fef3c7', color: '#b45309' },
  pension:       { bg: '#f3e8ff', color: '#7e22ce' },
  'real estate': { bg: '#fce7f3', color: '#9d174d' },
  other:         { bg: '#f1f5f9', color: '#475569' },
}
