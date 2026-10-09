export const CATEGORIES = [
  'top',
  'bottom',
  'shoes',
  'outerwear',
  'accessory',
  'mid-layer',
]
export const FORMALITIES = ['casual', 'smart-casual', 'formal']
export const FITS = ['fitted', 'regular', 'relaxed']
export const WARMTHS = ['light', 'medium', 'heavy']
export const LENGTHS = ['cropped', 'regular', 'long']
export const SEASONS = ['spring', 'summer', 'fall', 'winter']

export const MAX_LABEL_LENGTH = 60

export function extractJsonObject(text) {
  if (typeof text !== 'string' || !text) return null
  const fenced = text.match(/\{[\s\S]*\}/)
  if (!fenced) return null
  try {
    return JSON.parse(fenced[0])
  } catch {
    return null
  }
}

function sanitizeLabel(value) {
  if (typeof value !== 'string') return undefined
  const withoutControls = [...value]
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
  const cleaned = withoutControls
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
  return cleaned || undefined
}

/**
 * Rebuild a safe response from model output. Invalid fields are dropped
 * individually; unknown keys are discarded.
 */
export function sanitizeGarmentTags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}

  const out = {}

  let categories = []
  if (Array.isArray(raw.category)) {
    categories = raw.category
  } else if (typeof raw.category === 'string') {
    categories = [raw.category]
  }
  const allowedCats = [
    ...new Set(categories.filter((entry) => CATEGORIES.includes(entry))),
  ]
  if (allowedCats.length) out.category = allowedCats

  if (FORMALITIES.includes(raw.formality)) out.formality = raw.formality
  if (FITS.includes(raw.fit)) out.fit = raw.fit
  if (WARMTHS.includes(raw.warmth)) out.warmth = raw.warmth
  if (LENGTHS.includes(raw.length)) out.length = raw.length

  if (Array.isArray(raw.seasons)) {
    const seasons = [...new Set(raw.seasons.filter((s) => SEASONS.includes(s)))]
    if (seasons.length) out.seasons = seasons
  }

  const label = sanitizeLabel(raw.label)
  if (label) out.label = label

  return out
}
