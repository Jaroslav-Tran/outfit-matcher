import { describe, expect, it, vi } from 'vitest'
import {
  applyRefundCount,
  shouldRefundAfterUpstream,
  upstreamFailedBody,
} from './refundUsage.js'

describe('quota reserve-then-refund', () => {
  it('refunds once on upstream 500 and never leaks the body', () => {
    const refund = vi.fn()
    const reserved = true
    const upstreamOk = false
    const upstreamBody = 'Anthropic internal: sk-ant-secret'
    if (shouldRefundAfterUpstream({ reserved, upstreamOk, parseOk: true })) {
      refund()
    }
    const responseBody = upstreamFailedBody()
    expect(refund).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(responseBody)).not.toContain(upstreamBody)
    expect(responseBody).toEqual({ error: 'upstream_failed' })
  })

  it('does not refund on success', () => {
    expect(
      shouldRefundAfterUpstream({ reserved: true, upstreamOk: true, parseOk: true }),
    ).toBe(false)
  })

  it('refunds when parse fails after a 2xx', () => {
    expect(
      shouldRefundAfterUpstream({ reserved: true, upstreamOk: true, parseOk: false }),
    ).toBe(true)
  })

  it('never decrements below 0', () => {
    expect(applyRefundCount(0)).toBe(0)
    expect(applyRefundCount(1)).toBe(0)
    expect(applyRefundCount(5)).toBe(4)
    expect(applyRefundCount(-1)).toBe(0)
  })
})
