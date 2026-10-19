import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ThemeProvider } from '../ThemeContext'
import { useTheme } from '../useTheme'

function Controls() {
  const { visualStyle, setVisualStyle, setMode } = useTheme()
  return <><output>{visualStyle}</output><button onClick={() => setVisualStyle('arcade')}>Arcade</button><button onClick={() => setVisualStyle('editorial')}>Editoriale</button><button onClick={() => setMode('dark')}>Scuro</button></>
}
function mount() { return render(<ThemeProvider><Controls /></ThemeProvider>) }
beforeEach(() => {
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) })
  window.history.replaceState({}, '', '/')
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete document.documentElement.dataset.uiStyle; delete document.documentElement.dataset.theme })
describe('independent visual style', () => {
  it('keeps the editorial default and persists an explicit selection across remounts', () => {
    const view = mount()
    expect(document.documentElement.dataset.uiStyle).toBe('editorial')
    fireEvent.click(screen.getByText('Arcade'))
    expect(localStorage.getItem('visual-style')).toBe('arcade')
    view.unmount()
    mount()
    expect(document.documentElement.dataset.uiStyle).toBe('arcade')
    fireEvent.click(screen.getByText('Scuro'))
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.dataset.uiStyle).toBe('arcade')
    fireEvent.click(screen.getByText('Editoriale'))
    expect(document.documentElement.dataset.uiStyle).toBe('editorial')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
  it('previews a URL style without overwriting the saved preference', () => {
    localStorage.setItem('visual-style', 'editorial')
    window.history.replaceState({}, '', '/dashboard?style=arcade')
    mount()
    expect(document.documentElement.dataset.uiStyle).toBe('arcade')
    expect(localStorage.getItem('visual-style')).toBe('editorial')
  })
  it('falls back safely for an unknown saved style', () => {
    localStorage.setItem('visual-style', 'unknown')
    mount()
    expect(document.documentElement.dataset.uiStyle).toBe('editorial')
  })
})
