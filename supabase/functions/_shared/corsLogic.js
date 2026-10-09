/**
 * CORS only constrains browsers. SEC-01 (size/type), SEC-03 (reserve/refund),
 * and SUGGEST_GARMENT_DAILY_CAP are the real cost controls for suggest-garment.
 */
export const DEFAULT_ALLOWED_ORIGINS =
  'https://jaroslav-tran.github.io,http://localhost:5173,http://127.0.0.1:5173'

export function parseAllowedOrigins(raw) {
  const source = raw && String(raw).trim() ? String(raw) : DEFAULT_ALLOWED_ORIGINS
  return source
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function corsHeadersForOrigin(requestOrigin, allowedOrigins) {
  const origins = allowedOrigins || parseAllowedOrigins()
  const headers = {
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    Vary: 'Origin',
  }
  if (requestOrigin && origins.includes(requestOrigin)) {
    headers['Access-Control-Allow-Origin'] = requestOrigin
  }
  return headers
}
