/**
 * After a reserved quota slot, refund on upstream failure.
 * Returns whether a refund RPC should be invoked (caller performs the RPC).
 */
export function shouldRefundAfterUpstream({ reserved, upstreamOk, parseOk }) {
  return Boolean(reserved) && (!upstreamOk || !parseOk)
}

/**
 * Pure decrement helper used by tests and mirrored by the SQL RPC.
 * Floors at 0.
 */
export function applyRefundCount(current) {
  const n = Number(current)
  if (!Number.isFinite(n) || n <= 0) return 0
  return n - 1
}

/**
 * Build the client-facing 502 body. Never includes upstream detail.
 */
export function upstreamFailedBody() {
  return { error: 'upstream_failed' }
}
