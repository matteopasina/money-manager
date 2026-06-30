export const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'CZK', 'PLN', 'SEK', 'NOK', 'DKK', 'JPY', 'CAD', 'AUD']

export const ACCOUNT_TYPES = ['liquid', 'stocks', 'crypto', 'pension', 'real estate', 'other']

export const ACCOUNT_TYPE_BADGE: Record<string, { bg: string; color: string }> = {
  liquid:        { bg: '#A88B5C22', color: '#8a6a3a' },
  stocks:        { bg: '#B8842B22', color: '#8a5a12' },
  crypto:        { bg: '#C97B4A22', color: '#9a5a32' },
  pension:       { bg: '#6E5A3E22', color: '#5a4a30' },
  'real estate': { bg: '#3F7A5522', color: '#2f5a3e' },
  other:         { bg: '#92887322', color: '#6B6253' },
}
