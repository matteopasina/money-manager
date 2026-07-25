import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, minHeight: '100vh', padding: '2rem', textAlign: 'center',
        }}>
          <div className="section-title" style={{ marginBottom: 0 }}>Something went wrong</div>
          <p style={{ color: 'var(--ink-faint)', maxWidth: 480 }}>{this.state.error.message}</p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}
