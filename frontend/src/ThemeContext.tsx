import { useState, useEffect, type ReactNode } from 'react'
import { ThemeContext, type ThemeMode, type VisualStyle } from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem('theme') as ThemeMode) || 'light'
  )
  const [visualStyle, setVisualStyleState] = useState<VisualStyle>(() => {
    const requested = new URLSearchParams(window.location.search).get('style')
    const saved = requested ?? localStorage.getItem('visual-style')
    return saved === 'arcade' ? 'arcade' : 'editorial'
  })
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const isDark = mode === 'dark' || (mode === 'system' && systemDark)

  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light'
  }, [isDark])

  useEffect(() => { document.documentElement.dataset.uiStyle = visualStyle }, [visualStyle])

  function setVisualStyle(style: VisualStyle) {
    setVisualStyleState(style)
    localStorage.setItem('visual-style', style)
  }

  function setMode(m: ThemeMode) {
    setModeState(m)
    localStorage.setItem('theme', m)
  }

  return <ThemeContext.Provider value={{ mode, setMode, isDark, visualStyle, setVisualStyle }}>{children}</ThemeContext.Provider>
}
