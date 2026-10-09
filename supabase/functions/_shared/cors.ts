import {
  corsHeadersForOrigin as buildCors,
  parseAllowedOrigins,
} from './corsLogic.js'

/**
 * CORS only constrains browsers. SEC-01 (size/type), SEC-03 (reserve/refund),
 * and SUGGEST_GARMENT_DAILY_CAP are the real cost controls for this function.
 */
export function corsHeadersForOrigin(requestOrigin: string | null): Record<string, string> {
  const allowed = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'))
  return buildCors(requestOrigin, allowed)
}

/** @deprecated Prefer corsHeadersForOrigin(req.headers.get('Origin')) */
export const corsHeaders = corsHeadersForOrigin(null)
