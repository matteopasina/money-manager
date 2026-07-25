import { createContext } from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeContextValue {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  isDark: boolean
}

export const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  setMode: () => {},
  isDark: false,
})
