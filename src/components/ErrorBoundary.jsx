import { Component } from 'react'

/**
 * Top-level boundary: plain message + Reload. Never includes closet data.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Outfit Matcher crashed', error, info?.componentStack)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app">
          <section className="panel">
            <h1>Something went wrong</h1>
            <p className="lede">
              The app hit an unexpected error. Reload to try again. Your closet
              data in Supabase is unchanged.
            </p>
            <button type="button" className="primary" onClick={this.handleReload}>
              Reload
            </button>
          </section>
        </div>
      )
    }
    return this.props.children
  }
}
