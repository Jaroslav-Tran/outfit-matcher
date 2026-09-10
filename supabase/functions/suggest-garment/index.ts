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
