import { useEffect, useRef, useState, useCallback, type DependencyList } from 'react'

interface UseApiResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

// Runs `fetcher()` whenever `deps` changes: tracks loading/error so callers
// don't repeat try/catch/finally boilerplate, and drops any response that's
// no longer the latest in-flight request — e.g. switching filters fast enough
// that an earlier, slower response would otherwise land after a newer one and
// repaint stale data. `debounceMs` delays firing after the last `deps` change,
// for params (like a slider) that update on every tick.
export function useApi<T>(fetcher: () => Promise<T>, deps: DependencyList, debounceMs = 0): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const [tick, setTick] = useState(0)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const reload = useCallback(() => setTick(t => t + 1), [])

  useEffect(() => {
    const id = ++seq.current
    setLoading(true)
    const timer = setTimeout(() => {
      fetcherRef.current()
        .then(result => {
          if (id !== seq.current) return
          setData(result)
          setError(null)
        })
        .catch((e: unknown) => {
          if (id !== seq.current) return
          setError(e instanceof Error ? e.message : String(e))
        })
        .finally(() => {
          if (id !== seq.current) return
          setLoading(false)
        })
    }, debounceMs)
    return () => clearTimeout(timer)
    // `deps` is caller-supplied and intentionally drives this effect instead
    // of `fetcher` itself, so a fresh inline fetcher each render doesn't
    // trigger a refetch — only an explicit dependency change does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload }
}
