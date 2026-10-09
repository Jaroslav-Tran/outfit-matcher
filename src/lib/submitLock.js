/**
 * Synchronous re-entry guard for async click handlers.
 * Set the ref to true before the first await.
 */
export function tryAcquire(lockRef) {
  if (lockRef.current) return false
  lockRef.current = true
  return true
}

export function release(lockRef) {
  lockRef.current = false
}
