import { describe, expect, it, vi } from 'vitest'
import { release, tryAcquire } from './submitLock.js'

describe('submitLock', () => {
  it('two rapid calls with a sync lock run the insert exactly once', async () => {
    const insert = vi.fn(async () => {})
    const lock = { current: false }

    async function guarded() {
      if (!tryAcquire(lock)) return
      try {
        await insert()
      } finally {
        release(lock)
      }
    }

    await Promise.all([guarded(), guarded()])
    expect(insert).toHaveBeenCalledTimes(1)
  })
})
