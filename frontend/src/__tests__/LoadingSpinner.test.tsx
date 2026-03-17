import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import LoadingSpinner from '../components/LoadingSpinner'

describe('LoadingSpinner', () => {
  it('renders a spinner element', () => {
    const { container } = render(<LoadingSpinner />)
    const el = container.firstChild as HTMLElement
    expect(el).toHaveClass('spinner')
  })

  it('has the correct margin style', () => {
    const { container } = render(<LoadingSpinner />)
    const el = container.firstChild as HTMLElement
    expect(el.style.margin).toBe('4rem auto')
  })
})
