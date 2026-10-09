import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeadersForOrigin } from '../_shared/cors.ts'
import { validateSuggestImage } from './validateRequest.js'
import { extractJsonObject, sanitizeGarmentTags } from './sanitizeTags.js'
import {
  shouldRefundAfterUpstream,
  upstreamFailedBody,
} from './refundUsage.js'

const SYSTEM = `You tag one clothing photo for a wardrobe app.
Return JSON only, no markdown, matching:
{"category":["top"],"formality":"casual|smart-casual|formal","fit":"fitted|regular|relaxed","seasons":["spring","summer","fall","winter"],"warmth":"light|medium|heavy","length":"cropped|regular|long","label":"short English name"}
category is an array of one or more of: top | bottom | shoes | outerwear | accessory | mid-layer. Most items get exactly one. Suggest a second category only when the item plausibly serves that second role as worn — e.g. a cardigan or lightweight jacket as both top and mid-layer. Do not add implausible categories.
For shoes: fitted=sleek/low-profile, regular=standard, relaxed=chunky/platform.
seasons = seasons this piece is wearable in.
warmth: light | medium | heavy — based on visible fabric weight, weave, and texture (flat weave cotton/linen → light; cable knit or quilted → heavy). Best estimate; the user can correct it.
length: cropped | regular | long — relative to typical proportions for the garment's category.
Do not guess a hex color.`

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin')
  const cors = corsHeadersForOrigin(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: cors })
  }

  let reserved = false
  let supabase: ReturnType<typeof createClient> | null = null

  try {
    // 1. Auth
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Sign in required' }, 401, cors)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Supabase env is not set' }, 500, cors)
    }

    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Sign in required' }, 401, cors)

    // 2. Size / type validation (before quota)
    const contentLengthHeader = req.headers.get('Content-Length')
    const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null
    let body: { imageBase64?: unknown; mimeType?: unknown }
    try {
      body = await req.json()
    } catch {
      return json({ error: 'invalid_json' }, 400, cors)
    }

    const maxDecoded = Number.parseInt(
      Deno.env.get('SUGGEST_GARMENT_MAX_IMAGE_BYTES') || String(750 * 1024),
      10,
    )
    const mimeType =
      typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg'
    const validated = validateSuggestImage({
      contentLength,
      imageBase64: body.imageBase64,
      mimeType,
      maxDecodedBytes: maxDecoded,
    })
    if (!validated.ok) {
      return json({ error: validated.error }, validated.status, cors)
    }

    // 3. Quota reserve
    const cap = Number.parseInt(Deno.env.get('SUGGEST_GARMENT_DAILY_CAP') || '50', 10)
    const { data: callCount, error: usageError } = await supabase.rpc(
      'increment_edge_function_usage',
      { fn_name: 'suggest-garment' },
    )
    if (usageError) {
      console.error('rate limit check failed', usageError.message)
      return json({ error: 'Rate limit check failed' }, 503, cors)
    }
    if (Number(callCount) > cap) {
      await supabase.rpc('refund_edge_function_usage', { fn_name: 'suggest-garment' })
      return json(
        {
          error: 'rate_limited',
          message: 'Daily AI tagging limit reached — add tags manually for now',
        },
        429,
        cors,
      )
    }
    reserved = true

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      await refund(supabase)
      reserved = false
      return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500, cors)
    }

    // 4. Anthropic
    const anthropic = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: validated.mediaType,
                  data: body.imageBase64,
                },
              },
              { type: 'text', text: SYSTEM },
            ],
          },
        ],
      }),
    })

    if (
      shouldRefundAfterUpstream({
        reserved,
        upstreamOk: anthropic.ok,
        parseOk: true,
      })
    ) {
      const detail = await anthropic.text()
      console.error('Claude upstream failed', anthropic.status, detail)
      await refund(supabase)
      reserved = false
      return json(upstreamFailedBody(), 502, cors)
    }

    let payload: { content?: Array<{ type: string; text?: string }> }
    try {
      payload = await anthropic.json()
    } catch (error) {
      console.error('Claude JSON parse failed', error)
      if (shouldRefundAfterUpstream({ reserved, upstreamOk: true, parseOk: false })) {
        await refund(supabase)
        reserved = false
      }
      return json(upstreamFailedBody(), 502, cors)
    }

    const text =
      payload.content?.find((block) => block.type === 'text')?.text || ''
    const parsed = extractJsonObject(text)
    if (
      shouldRefundAfterUpstream({
        reserved,
        upstreamOk: true,
        parseOk: Boolean(parsed),
      })
    ) {
      console.error('No JSON in Claude response', text.slice(0, 200))
      await refund(supabase)
      reserved = false
      return json(upstreamFailedBody(), 502, cors)
    }

    const sanitized = sanitizeGarmentTags(parsed)
    return json(sanitized, 200, cors)
  } catch (error) {
    console.error('suggest-garment failed', error)
    if (shouldRefundAfterUpstream({ reserved, upstreamOk: false, parseOk: false }) && supabase) {
      await refund(supabase)
    }
    return json({ error: 'suggest-garment failed' }, 500, cors)
  }
})

async function refund(supabase: ReturnType<typeof createClient>) {
  const { error } = await supabase.rpc('refund_edge_function_usage', {
    fn_name: 'suggest-garment',
  })
  if (error) console.error('refund failed', error.message)
}

function json(body: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}
