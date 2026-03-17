import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import Alert from '../components/Alert'

describe('Alert', () => {
  it('renders children', () => {
    render(<Alert type="info">Hello world</Alert>)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('applies the correct CSS class for type=success', () => {
    const { container } = render(<Alert type="success">OK</Alert>)
    expect(container.firstChild).toHaveClass('alert-success')
  })

  it('applies the correct CSS class for type=error', () => {
    const { container } = render(<Alert type="error">Oops</Alert>)
    expect(container.firstChild).toHaveClass('alert-error')
  })

  it('applies the correct CSS class for type=warning', () => {
    const { container } = render(<Alert type="warning">Watch out</Alert>)
    expect(container.firstChild).toHaveClass('alert-warning')
  })

  it('applies the correct CSS class for type=info', () => {
    const { container } = render(<Alert type="info">Note</Alert>)
    expect(container.firstChild).toHaveClass('alert-info')
  })

  it('shows close button when onClose is provided', () => {
    render(<Alert type="info" onClose={() => {}}>Message</Alert>)
    expect(screen.getByText('✕')).toBeInTheDocument()
  })

  it('does not show close button when onClose is not provided', () => {
    render(<Alert type="info">Message</Alert>)
    expect(screen.queryByText('✕')).not.toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<Alert type="info" onClose={onClose}>Message</Alert>)
    fireEvent.click(screen.getByText('✕'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passes additional styles through', () => {
    const { container } = render(<Alert type="info" style={{ maxWidth: 400 }}>Msg</Alert>)
    expect((container.firstChild as HTMLElement).style.maxWidth).toBe('400px')
  })
})
