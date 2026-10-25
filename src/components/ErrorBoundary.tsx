import { Component, type ErrorInfo, type ReactNode } from 'react'
import { log } from '../lib/log'

/**
 * Catches render-time exceptions so a bad track payload doesn't white-screen
 * a display that is meant to run for hours. Class component because React
 * only exposes componentDidCatch on classes; this is the one place you need one.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('render', 'component crashed', { error, componentStack: info.componentStack })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <main className="gate">
        <h1>Something broke</h1>
        <p className="muted">{this.state.error.message}</p>
        <button className="primary" onClick={() => window.location.reload()}>Reload</button>
        <button className="link" onClick={log.download}>Download log</button>
      </main>
    )
  }
}
