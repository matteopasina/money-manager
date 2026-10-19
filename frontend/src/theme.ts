import { createContext } from 'react'

export type VisualStyle = 'editorial' | 'arcade'
export const VISUAL_STYLES: { value: VisualStyle; label: string; description: string }[] = [
  { value: 'editorial', label: 'Editoriale', description: 'Caldo e minimale' },
  { value: 'arcade', label: 'Arcade', description: 'Pixel e atmosfera anni ’80' },
]

export type ThemeMode = 'light' | 'dark' | 'system'

export interface ThemeContextValue {
  mode: ThemeMode
  setMode: (m: ThemeMode) => void
  isDark: boolean
  visualStyle: VisualStyle
  setVisualStyle: (style: VisualStyle) => void
}

export const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light',
  setMode: () => {},
  isDark: false,
  visualStyle: 'editorial',
  setVisualStyle: () => {},
})
