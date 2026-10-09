import { describe, expect, it } from 'vitest'
import {
  MAX_CONTENT_LENGTH,
  validateSuggestImage,
} from './validateRequest.js'

function validBase64OfDecodedBytes(decodedBytes) {
  const rawLen = Math.ceil((decodedBytes * 4) / 3)
  const padded = rawLen + ((4 - (rawLen % 4)) % 4)
  return `${'A'.repeat(padded - 4)}AAAA`
}

describe('validateSuggestImage', () => {
  it('rejects Content-Length over 1.5 MB with 413', () => {
    const result = validateSuggestImage({
      contentLength: MAX_CONTENT_LENGTH + 1,
      imageBase64: validBase64OfDecodedBytes(100),
      mimeType: 'image/jpeg',
    })
    expect(result).toEqual({ ok: false, status: 413, error: 'payload_too_large' })
  })

  it('rejects decoded image over the max with 413', () => {
    const result = validateSuggestImage({
      contentLength: 1000,
      imageBase64: validBase64OfDecodedBytes(800 * 1024),
      mimeType: 'image/jpeg',
      maxDecodedBytes: 750 * 1024,
    })
    expect(result).toEqual({ ok: false, status: 413, error: 'image_too_large' })
  })

  it('rejects unsupported media type with 415', () => {
    const result = validateSuggestImage({
      imageBase64: validBase64OfDecodedBytes(100),
      mimeType: 'image/gif',
    })
    expect(result).toEqual({ ok: false, status: 415, error: 'unsupported_media_type' })
  })

  it('rejects missing imageBase64 with 400', () => {
    expect(
      validateSuggestImage({ imageBase64: null, mimeType: 'image/jpeg' }),
    ).toEqual({ ok: false, status: 400, error: 'imageBase64 required' })
  })

  it('rejects invalid base64 charset with 400', () => {
    expect(
      validateSuggestImage({
        imageBase64: '%%%%',
        mimeType: 'image/jpeg',
      }),
    ).toEqual({ ok: false, status: 400, error: 'invalid_base64' })
  })

  it('accepts a valid jpeg payload', () => {
    const result = validateSuggestImage({
      contentLength: 200,
      imageBase64: validBase64OfDecodedBytes(100),
      mimeType: 'image/jpeg',
    })
    expect(result).toEqual({ ok: true, mediaType: 'image/jpeg' })
  })
})
