import { Navigate, useLocation } from 'react-router-dom'

export default function LegacyRedirect({ to }: { to: string }) {
  const location = useLocation()
  const [pathname, defaults] = to.split('?')
  const search = new URLSearchParams(location.search)
  new URLSearchParams(defaults).forEach((value, key) => { if (!search.has(key)) search.set(key, value) })
  return <Navigate to={{ pathname, search: search.toString() ? `?${search}` : '', hash: location.hash }} state={location.state} replace />
}
