/** Max Content-Length before reading the body (1.5 MB). */
export const MAX_CONTENT_LENGTH = Math.floor(1.5 * 1024 * 1024)

export const ALLOWED_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

const BASE64_CHARSET = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Cheap base64 shape check (length + charset), then decoded-byte estimate.
 * @returns {{ ok: true, mediaType: string } | { ok: false, status: number, error: string }}
 */
export function validateSuggestImage({
  contentLength,
  imageBase64,
  mimeType,
  maxDecodedBytes = 750 * 1024,
}) {
  if (
    contentLength != null &&
    Number.isFinite(contentLength) &&
    contentLength > MAX_CONTENT_LENGTH
  ) {
    return { ok: false, status: 413, error: 'payload_too_large' }
  }

  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return { ok: false, status: 400, error: 'imageBase64 required' }
  }

  if (imageBase64.length % 4 !== 0 || !BASE64_CHARSET.test(imageBase64)) {
    return { ok: false, status: 400, error: 'invalid_base64' }
  }

  const padding = imageBase64.endsWith('==') ? 2 : imageBase64.endsWith('=') ? 1 : 0
  const decodedBytes = Math.floor((imageBase64.length * 3) / 4) - padding
  if (decodedBytes > maxDecodedBytes) {
    return { ok: false, status: 413, error: 'image_too_large' }
  }

  if (!ALLOWED_MEDIA_TYPES.has(mimeType)) {
    return { ok: false, status: 415, error: 'unsupported_media_type' }
  }

  return { ok: true, mediaType: mimeType }
}
