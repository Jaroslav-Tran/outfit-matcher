import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { corsHeaders } from '../_shared/cors.ts'

const SYSTEM = `You tag one clothing photo for a wardrobe app.
Return JSON only, no markdown, matching:
{"category":"top|bottom|shoes|outerwear|accessory","formality":"casual|smart-casual|formal","fit":"fitted|regular|relaxed","seasons":["spring","summer","fall","winter"],"label":"short English name"}
For shoes: fitted=sleek/low-profile, regular=standard, relaxed=chunky/platform.
seasons = seasons this piece is wearable in.
Do not guess a hex color.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Sign in required' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    if (!supabaseUrl || !supabaseAnonKey) {
      return json({ error: 'Supabase env is not set' }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) return json({ error: 'Sign in required' }, 401)

    const cap = Number.parseInt(Deno.env.get('SUGGEST_GARMENT_DAILY_CAP') || '50', 10)
    const { data: callCount, error: usageError } = await supabase.rpc(
      'increment_edge_function_usage',
      { fn_name: 'suggest-garment' },
    )
    if (usageError) {
      return json({ error: 'Rate limit check failed', detail: usageError.message }, 503)
    }
    if (Number(callCount) > cap) {
      return json(
        {
          error: 'rate_limited',
          message: 'Daily AI tagging limit reached — add tags manually for now',
        },
        429,
      )
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!apiKey) {
      return json({ error: 'ANTHROPIC_API_KEY is not set' }, 500)
    }

    const { imageBase64, mimeType } = await req.json()
    if (!imageBase64) return json({ error: 'imageBase64 required' }, 400)

    const mediaType =
      mimeType === 'image/png' || mimeType === 'image/webp' || mimeType === 'image/gif'
        ? mimeType
        : 'image/jpeg'

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
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              { type: 'text', text: SYSTEM },
            ],
          },
        ],
      }),
    })

    if (!anthropic.ok) {
      const detail = await anthropic.text()
      return json({ error: 'Claude request failed', detail }, 502)
    }

    const payload = await anthropic.json()
    const text = payload.content?.find((block: { type: string }) => block.type === 'text')?.text || ''
    const parsed = JSON.parse(extractJson(text))
    return json(parsed)
  } catch (error) {
    return json({ error: error.message || 'suggest-garment failed' }, 500)
  }
})

function extractJson(text: string) {
  const fenced = text.match(/\{[\s\S]*\}/)
  if (!fenced) throw new Error('No JSON in Claude response')
  return fenced[0]
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
