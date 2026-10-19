import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import MoneyChart from '../components/MoneyChart'
vi.mock('plotly.js/dist/plotly-basic.min.js', () => ({ default: {} }))
vi.mock('react-plotly.js/factory', () => ({ default: () => ({ layout }: { layout: { width?: number } }) => <div data-testid="chart" data-width={layout.width} /> }))
vi.mock('../useTheme', () => ({ useTheme: () => ({ isDark: false }) }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('responsive charts', () => {
  it('resizes when a hidden container is revealed or its layout changes', () => {
    let resize: ResizeObserverCallback = () => {}
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe() {}
      disconnect = disconnect
    })
    const { unmount } = render(<MoneyChart data={[]} />)
    const update = (width: number) => act(() => resize([{ contentRect: { width } } as ResizeObserverEntry], {} as ResizeObserver))
    update(0)
    expect(screen.getByTestId('chart')).not.toHaveAttribute('data-width')
    update(320)
    expect(screen.getByTestId('chart')).toHaveAttribute('data-width', '320')
    update(640)
    expect(screen.getByTestId('chart')).toHaveAttribute('data-width', '640')
    unmount()
    expect(disconnect).toHaveBeenCalled()
  })
})
