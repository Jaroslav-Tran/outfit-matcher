import { describe, expect, it, vi } from 'vitest'
import {
  BULK_STATES,
  applyBulkTransition,
  bulkCapNotice,
  capBatchSize,
  createTrackedConcurrencyLimiter,
  isDuplicateCandidate,
  runSuggestBatch,
} from './bulkUpload.js'
import { SuggestLimitError } from './suggestTags.js'

describe('capBatchSize', () => {
  it('returns 20 files and 5 dropped when 25 are selected', () => {
    const files = Array.from({ length: 25 }, (_, i) => ({ name: `f${i}.jpg` }))
    const result = capBatchSize(files, 20)
    expect(result.files).toHaveLength(20)
    expect(result.dropped).toBe(5)
    expect(result.files[0].name).toBe('f0.jpg')
    expect(result.files[19].name).toBe('f19.jpg')
  })

  it('drops nothing when under the cap', () => {
    const files = Array.from({ length: 3 }, (_, i) => ({ name: `f${i}.jpg` }))
    expect(capBatchSize(files, 20)).toEqual({ files, dropped: 0 })
  })

  it('describes how many photos were queued and dropped', () => {
    expect(bulkCapNotice(20, 5)).toBe('20 photos queued. 5 not included because of the limit.')
    expect(bulkCapNotice(3, 0)).toBe('')
  })
})

describe('isDuplicateCandidate', () => {
  it('is true for same category and ΔE < 8', () => {
    expect(
      isDuplicateCandidate(
        { hex: '#ff0000', category: 'top' },
        [{ hex: '#fe0505', category: 'top', label: 'Red tee' }],
      ),
    ).toBe(true)
  })

  it('is false for same hex but different category', () => {
    expect(
      isDuplicateCandidate(
        { hex: '#ff0000', category: 'top' },
        [{ hex: '#ff0000', category: 'bottom' }],
      ),
    ).toBe(false)
  })

  it('is false for same category when ΔE > 8', () => {
    expect(
      isDuplicateCandidate(
        { hex: '#ff0000', category: 'top' },
        [{ hex: '#0000ff', category: 'top' }],
      ),
    ).toBe(false)
  })
})

describe('createConcurrencyLimiter', () => {
  it('keeps at most 2 tasks in flight and resolves all 10', async () => {
    const limiter = createTrackedConcurrencyLimiter(2)
    const order = []
    const tasks = Array.from({ length: 10 }, (_, i) =>
      limiter.run(async () => {
        order.push(`start-${i}`)
        expect(limiter.inFlight).toBeLessThanOrEqual(2)
        await Promise.resolve()
        order.push(`end-${i}`)
        return i
      }),
    )
    const results = await Promise.all(tasks)
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(limiter.peak).toBeLessThanOrEqual(2)
    expect(limiter.inFlight).toBe(0)
    expect(order.filter((entry) => entry.startsWith('start-'))).toHaveLength(10)
  })
})

describe('runSuggestBatch quota fallback', () => {
  it('stops calling suggest after a 429 and leaves later items for manual tags', async () => {
    const calls = []
    const suggestFn = vi.fn(async (task) => {
      calls.push(task.id)
      if (task.id === 't3') throw new SuggestLimitError()
      return { category: 'top', label: task.id }
    })

    const { results, quotaHit } = await runSuggestBatch(
      [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }, { id: 't5' }],
      suggestFn,
      { concurrency: 1 },
    )

    expect(quotaHit).toBe(true)
    expect(calls).toEqual(['t1', 't2', 't3'])
    expect(results.find((row) => row.id === 't4')).toMatchObject({
      tags: null,
      quotaSkipped: true,
    })
    expect(results.find((row) => row.id === 't5')).toMatchObject({
      tags: null,
      quotaSkipped: true,
    })
    expect(results.find((row) => row.id === 't1').tags.label).toBe('t1')
  })
})

describe('applyBulkTransition', () => {
  it('goes queued → processing → ready', () => {
    const queued = {
      id: 'a',
      state: BULK_STATES.queued,
      excluded: false,
      hex: '#808080',
    }
    const processing = applyBulkTransition(queued, 'start')
    expect(processing.state).toBe(BULK_STATES.processing)
    const ready = applyBulkTransition(processing, 'ready', {
      hex: '#112233',
      category: 'top',
      label: 'Navy tee',
    })
    expect(ready.state).toBe(BULK_STATES.ready)
    expect(ready.hex).toBe('#112233')
    expect(ready.label).toBe('Navy tee')
  })

  it('goes queued → processing → failed on resize failure', () => {
    const queued = { id: 'b', state: BULK_STATES.queued, excluded: false }
    const processing = applyBulkTransition(queued, 'start')
    const failed = applyBulkTransition(processing, 'fail', {
      error: 'Could not encode resized image',
    })
    expect(failed.state).toBe(BULK_STATES.failed)
    expect(failed.error).toMatch(/encode/i)
  })

  it('excluding a ready item flips excluded without changing other batch items', () => {
    const batch = [
      { id: '1', state: BULK_STATES.ready, excluded: false, hex: '#111111' },
      { id: '2', state: BULK_STATES.ready, excluded: false, hex: '#222222' },
    ]
    const next = batch.map((item) =>
      item.id === '1' ? applyBulkTransition(item, 'exclude') : item,
    )
    expect(next[0].excluded).toBe(true)
    expect(next[0].state).toBe(BULK_STATES.ready)
    expect(next[1]).toEqual(batch[1])
  })
})
