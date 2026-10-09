import { describe, expect, it } from 'vitest'
import {
  corsHeadersForOrigin,
  parseAllowedOrigins,
} from './corsLogic.js'

describe('corsHeadersForOrigin', () => {
  const allowed = parseAllowedOrigins(
    'https://jaroslav-tran.github.io,http://localhost:5173',
  )

  it('reflects an allowed origin and sets Vary', () => {
    const headers = corsHeadersForOrigin('http://localhost:5173', allowed)
    expect(headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(headers.Vary).toBe('Origin')
  })

  it('omits Access-Control-Allow-Origin for disallowed origins', () => {
    const headers = corsHeadersForOrigin('https://evil.example', allowed)
    expect(headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(headers.Vary).toBe('Origin')
  })
})
