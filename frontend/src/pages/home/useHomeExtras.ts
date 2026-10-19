import { api } from '../../api/client'
import { useApi } from '../../hooks/useApi'

// Optional data fail independently; neither can block the financial overview.
export default function useHomeExtras() {
  const budgets = useApi(() => api.budgets.list(), [])
  const sync = useApi(() => api.sync.status(), [])
  return { budgets, sync }
}
