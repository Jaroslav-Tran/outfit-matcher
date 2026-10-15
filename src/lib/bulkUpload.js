import { normalizeCategories } from './constants.js'
import { deltaE, isValidHex, toHex } from './colorUtils.js'

function categoriesOverlap(a, b) {
  const left = normalizeCategories(a)
  const right = normalizeCategories(b)
  return left.some((entry) => right.includes(entry))
}

export const MAX_BULK_UPLOAD_COUNT = 20
export const BULK_SUGGEST_CONCURRENCY = 2
export const DUPLICATE_DELTA_E = 8

export const BULK_STATES = {
  queued: 'queued',
  processing: 'processing',
  ready: 'ready',
  saved: 'saved',
  failed: 'failed',
}

/**
 * Cap a FileList / array to maxCount. Returns taken files and how many were dropped.
 */
export function capBatchSize(files, maxCount = MAX_BULK_UPLOAD_COUNT) {
  const list = Array.from(files || [])
  if (list.length <= maxCount) {
    return { files: list, dropped: 0, omitted: [] }
  }
  return {
    files: list.slice(0, Math.max(0, maxCount)),
    dropped: list.length - maxCount,
    omitted: list.slice(Math.max(0, maxCount)),
  }
}

/**
 * Popup copy for files the queue did not accept.
 * Names stay in selection order. Null when nothing was left out.
 */
export function bulkCapDetail({ added, alreadyWaiting, omittedNames }) {
  const names = (omittedNames || []).map((name) => {
    const text = String(name || '').trim()
    return text || 'Untitled photo'
  })
  if (!names.length) return null
  const addedCount = Number(added) || 0
  const waiting = Number(alreadyWaiting) || 0
  const leftOut = names.length === 1 ? 'This was not:' : 'These were not:'
  const lead =
    waiting > 0
      ? `${addedCount === 0 ? 'None added' : `${addedCount} added`}. The queue already had ${waiting}. ${leftOut}`
      : `${addedCount === 1 ? 'The first photo was added.' : `The first ${addedCount} were added.`} ${leftOut}`
  return { lead, names }
}

/** Shown when a bulk pick is larger than the cap. Empty when nothing was dropped. */
export function bulkCapNotice(queued, dropped) {
  const kept = Number(queued) || 0
  const skipped = Number(dropped) || 0
  if (skipped <= 0) return ''
  return `${kept} photos queued. ${skipped} not included because of the limit.`
}

/**
 * Soft duplicate nudge: same category and ΔE < threshold.
 */
export function isDuplicateCandidate(newItem, existingItems, threshold = DUPLICATE_DELTA_E) {
  return Boolean(findDuplicateMatch(newItem, existingItems, threshold))
}

export function findDuplicateMatch(newItem, existingItems, threshold = DUPLICATE_DELTA_E) {
  if (!newItem || !isValidHex(newItem.hex) || !normalizeCategories(newItem.category).length) {
    return null
  }
  const hex = toHex(newItem.hex)
  for (const other of existingItems || []) {
    if (!other || !categoriesOverlap(newItem.category, other.category)) continue
    if (!isValidHex(other.hex)) continue
    if (deltaE(hex, other.hex) < threshold) return other
  }
  return null
}

export function isSuggestQuotaError(error) {
  if (!error) return false
  if (error.name === 'SuggestLimitError') return true
  const status = error.context?.status || error.status
  if (status === 429) return true
  const text = `${error.message || ''} ${error.error || ''}`.toLowerCase()
  return text.includes('rate_limited') || text.includes('daily') && text.includes('limit')
}

/**
 * Async semaphore: at most `limit` tasks in flight.
 */
export function createConcurrencyLimiter(limit) {
  const max = Math.max(1, Number(limit) || 1)
  let active = 0
  const waiters = []

  function pump() {
    while (active < max && waiters.length) {
      const next = waiters.shift()
      active += 1
      next()
    }
  }

  return function run(task) {
    return new Promise((resolve, reject) => {
      const start = () => {
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            active -= 1
            pump()
          })
      }
      waiters.push(start)
      pump()
    })
  }
}

/**
 * Runs suggest tasks with concurrency + quota short-circuit.
 * Once a quota error is seen, later tasks are not invoked (quotaSkipped).
 */
export async function runSuggestBatch(tasks, suggestFn, options = {}) {
  const concurrency = options.concurrency ?? BULK_SUGGEST_CONCURRENCY
  const onQuotaHit = options.onQuotaHit
  const limit = createConcurrencyLimiter(concurrency)
  let quotaHit = false

  const results = await Promise.all(
    tasks.map((task) =>
      limit(async () => {
        if (quotaHit) {
          return { id: task.id, tags: null, quotaSkipped: true }
        }
        try {
          const tags = await suggestFn(task)
          return { id: task.id, tags: tags || null, quotaSkipped: false }
        } catch (error) {
          if (isSuggestQuotaError(error)) {
            quotaHit = true
            onQuotaHit?.()
            return { id: task.id, tags: null, quotaSkipped: true, quotaHit: true }
          }
          // Non-quota suggest failure → manual tags, not failed.
          return { id: task.id, tags: null, quotaSkipped: false }
        }
      }),
    ),
  )

  return { results, quotaHit }
}

export function createPendingBulkItem(file, id = crypto.randomUUID()) {
  return {
    id,
    file,
    previewUrl: URL.createObjectURL(file),
    state: BULK_STATES.queued,
    excluded: false,
    blob: null,
    photoColors: [],
    hex: '#808080',
    category: ['top'],
    formality: 'casual',
    fit: 'regular',
    seasons: ['spring', 'summer', 'fall', 'winter'],
    isNeutral: true,
    label: '',
    error: null,
    duplicateOf: null,
  }
}

/**
 * Pure state transitions for a bulk card.
 * event: start | ready | fail | save | exclude | include | retry
 */
export function applyBulkTransition(item, event, payload = {}) {
  if (!item) return item

  switch (event) {
    case 'start':
    case 'retry':
      if (event === 'retry' && item.state !== BULK_STATES.failed) return item
      if (event === 'start' && item.state !== BULK_STATES.queued && item.state !== BULK_STATES.failed) {
        return item
      }
      return { ...item, state: BULK_STATES.processing, error: null }

    case 'ready':
      if (item.state !== BULK_STATES.processing) return item
      return {
        ...item,
        state: BULK_STATES.ready,
        error: null,
        blob: payload.blob ?? item.blob,
        photoColors: payload.photoColors ?? item.photoColors,
        hex: payload.hex ?? item.hex,
        category: payload.category ?? item.category,
        formality: payload.formality ?? item.formality,
        fit: payload.fit ?? item.fit,
        warmth: payload.warmth ?? item.warmth ?? null,
        length: payload.length ?? item.length ?? null,
        seasons: payload.seasons ?? item.seasons,
        isNeutral: payload.isNeutral ?? item.isNeutral,
        label: payload.label ?? item.label,
        previewUrl: payload.previewUrl || item.previewUrl,
        duplicateOf: payload.duplicateOf ?? item.duplicateOf,
      }

    case 'fail':
      if (item.state !== BULK_STATES.processing && item.state !== BULK_STATES.queued) return item
      return {
        ...item,
        state: BULK_STATES.failed,
        error: payload.error || 'Could not process this file.',
      }

    case 'save':
      if (item.state !== BULK_STATES.ready) return item
      return { ...item, state: BULK_STATES.saved, excluded: false }

    case 'exclude':
      if (item.state === BULK_STATES.saved) return item
      return { ...item, excluded: true }

    case 'include':
      return { ...item, excluded: false }

    default:
      return item
  }
}

export function patchBulkItem(item, patch) {
  if (!item || item.state === BULK_STATES.saved) return item
  return { ...item, ...patch }
}

export function duplicateNoteLabel(match) {
  if (!match) return ''
  return match.label || match.hex || 'another item'
}

/** Useful for tests: count how many limiter tasks are active via a spy helper. */
export function createTrackedConcurrencyLimiter(limit) {
  const run = createConcurrencyLimiter(limit)
  let inFlight = 0
  let peak = 0
  return {
    get inFlight() {
      return inFlight
    },
    get peak() {
      return peak
    },
    run(task) {
      return run(async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        try {
          return await task()
        } finally {
          inFlight -= 1
        }
      })
    },
  }
}