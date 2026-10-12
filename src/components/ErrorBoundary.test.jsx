import { describe, expect, it, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary.jsx'

describe('ErrorBoundary', () => {
  it('derives hasError state when a child throws', () => {
    expect(ErrorBoundary.getDerivedStateFromError(new Error('boom'))).toEqual({
      hasError: true,
    })
  })

  it('logs the error in componentDidCatch without exposing closet data', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boundary = new ErrorBoundary({ children: null })
    const err = new Error('unit-test-crash')
    boundary.componentDidCatch(err, { componentStack: '\n    at Boom' })
    expect(spy).toHaveBeenCalled()
    const logged = spy.mock.calls.map((args) => args.join(' ')).join(' ')
    expect(logged).toContain('unit-test-crash')
    expect(logged.toLowerCase()).not.toContain('wardrobe')
    expect(logged.toLowerCase()).not.toContain('palette')
    spy.mockRestore()
  })
})
