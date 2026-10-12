/** Signed URL lifetime requested from Supabase (seconds). */
export const SIGNED_URL_TTL_SECONDS = 60 * 60

/** Do not re-sign the same item more than once per this window (ms). */
export const RESIGN_MIN_INTERVAL_MS = 60 * 1000

/** Re-sign on visibility if URLs are older than this (ms). */
export const RESIGN_STALE_AFTER_MS = 45 * 60 * 1000

/**
 * Returns true if a re-sign is allowed for this item given the last attempt time.
 */
export function canResignItem(lastAttemptAt, now = Date.now(), minIntervalMs = RESIGN_MIN_INTERVAL_MS) {
  if (lastAttemptAt == null) return true
  return now - lastAttemptAt >= minIntervalMs
}

export function urlsAreStale(signedAt, now = Date.now(), staleAfterMs = RESIGN_STALE_AFTER_MS) {
  if (signedAt == null) return true
  return now - signedAt >= staleAfterMs
}

/**
 * Pure retry-guard: records attempt and returns whether to proceed.
 * Mutates `attempts` Map<itemId, timestamp>.
 */
export function tryBeginResign(attempts, itemId, now = Date.now(), minIntervalMs = RESIGN_MIN_INTERVAL_MS) {
  const last = attempts.get(itemId)
  if (!canResignItem(last, now, minIntervalMs)) return false
  attempts.set(itemId, now)
  return true
}
