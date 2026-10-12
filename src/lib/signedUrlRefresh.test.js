import { describe, expect, it } from 'vitest'
import {
  canResignItem,
  RESIGN_MIN_INTERVAL_MS,
  tryBeginResign,
  urlsAreStale,
} from './signedUrlRefresh.js'

describe('signed URL resign guard', () => {
  it('allows the first resign and blocks repeats inside the window', () => {
    const attempts = new Map()
    const t0 = 1_000_000
    expect(tryBeginResign(attempts, 'a', t0)).toBe(true)
    expect(tryBeginResign(attempts, 'a', t0 + 1)).toBe(false)
    expect(tryBeginResign(attempts, 'a', t0 + RESIGN_MIN_INTERVAL_MS)).toBe(true)
  })

  it('does not trigger more than one re-sign per window on repeated errors', () => {
    const attempts = new Map()
    const now = 5_000_000
    const results = []
    for (let i = 0; i < 10; i += 1) {
      results.push(tryBeginResign(attempts, 'item-1', now + i * 100))
    }
    expect(results.filter(Boolean)).toHaveLength(1)
  })

  it('detects stale URLs after 45 minutes', () => {
    expect(urlsAreStale(0, 45 * 60 * 1000)).toBe(true)
    expect(urlsAreStale(0, 44 * 60 * 1000)).toBe(false)
    expect(canResignItem(null)).toBe(true)
  })
})
