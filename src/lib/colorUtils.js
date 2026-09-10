import chroma from 'chroma-js'

export const NEUTRALS = [
  '#000000',
  '#FFFFFF',
  '#808080',
  '#A9A9A9',
  '#D3D3D3',
  '#000080',
  '#F5F5DC',
  '#D2B48C',
  '#8B4513',
  '#556B2F',
  '#36454F',
]

export const SAME_COLOR_DELTA_E = 12
export const HIGH_SATURATION_THRESHOLD = 0.6

export const SCHEME_ORDER = [
  'neutral-only',
  'monochromatic',
  'analogous',
  'complementary',
]

export const SCHEME_LABELS = {
  'neutral-only': 'Neutral-only',
  monochromatic: 'Monochromatic',
  analogous: 'Analogous',
  complementary: 'Complementary contrast',
}

export function isValidHex(value) {
  if (!value || typeof value !== 'string') return false
  try {
    return chroma.valid(value)
  } catch {
    return false
  }
}

export function toHex(value) {
  if (!isValidHex(value)) return null
  return chroma(value).hex()
}

export function isSuggestedNeutral(hex) {
  if (!isValidHex(hex)) return false
  return NEUTRALS.some((neutralRef) => chroma.deltaE(hex, neutralRef) < SAME_COLOR_DELTA_E)
}

export function deltaE(a, b) {
  if (!isValidHex(a) || !isValidHex(b)) return Infinity
  return chroma.deltaE(a, b)
}

export function isHighSaturation(hex) {
  if (!isValidHex(hex)) return false
  return chroma(hex).get('hsl.s') > HIGH_SATURATION_THRESHOLD
}

export function hueOf(hex) {
  if (!isValidHex(hex)) return NaN
  const hue = chroma(hex).get('hsl.h')
  return typeof hue === 'number' && Number.isFinite(hue) ? hue : NaN
}

export function circularHueDistance(h1, h2) {
  const delta = Math.abs(h1 - h2)
  return Math.min(delta, 360 - delta)
}

export function hueFamilyName(hex) {
  const hue = hueOf(hex)
  if (!Number.isFinite(hue)) return 'grey'
  if (hue < 15 || hue >= 345) return 'red'
  if (hue < 45) return 'orange'
  if (hue < 70) return 'yellow'
  if (hue < 150) return 'green'
  if (hue < 195) return 'teal'
  if (hue < 255) return 'blue'
  if (hue < 290) return 'purple'
  return 'pink'
}

export function detectColorScheme(hexList) {
  const hexes = hexList || []
  if (hexes.length === 0) return 'neutral-only'
  if (hexes.length === 1) return 'monochromatic'
  if (hexes.length !== 2) return 'unclassified'

  const h1 = hueOf(hexes[0])
  const h2 = hueOf(hexes[1])
  if (!Number.isFinite(h1) || !Number.isFinite(h2)) return 'unclassified'

  const distance = circularHueDistance(h1, h2)
  if (distance <= 20) return 'monochromatic'
  if (distance <= 60) return 'analogous'
  if (distance >= 150 && distance <= 210) return 'complementary'
  return 'unclassified'
}

export function findClosestPaletteColor(hex, palette) {
  if (!isValidHex(hex) || !palette?.length) {
    return { closestPaletteMatch: null, deltaE: Infinity }
  }

  let closestPaletteMatch = null
  let bestDeltaE = Infinity

  for (const color of palette) {
    const distance = deltaE(hex, color.hex)
    if (distance < bestDeltaE) {
      bestDeltaE = distance
      closestPaletteMatch = color
    }
  }

  return { closestPaletteMatch, deltaE: bestDeltaE }
}

export function distinctNonNeutralHexes(items) {
  const representatives = []
  for (const item of items.filter((entry) => !entry.isNeutral)) {
    const alreadyCounted = representatives.some(
      (rep) => deltaE(rep, item.hex) < SAME_COLOR_DELTA_E,
    )
    if (!alreadyCounted) representatives.push(item.hex)
  }
  return representatives
}

export function countDistinctNonNeutralColors(items) {
  return distinctNonNeutralHexes(items).length
}

export function annotateWardrobeWithPalette(wardrobe, palette) {
  return wardrobe.map((item) => {
    const match = findClosestPaletteColor(item.hex, palette)
    return {
      ...item,
      closestPaletteMatch: match.closestPaletteMatch,
      deltaE: match.deltaE,
    }
  })
}

export function suggestHexFromImageData(imageData) {
  if (!imageData?.data?.length) return null
  const { data, width, height } = imageData
  const buckets = new Map()
  const marginX = Math.floor(width * 0.18)
  const marginY = Math.floor(height * 0.18)

  for (let y = marginY; y < height - marginY; y += 3) {
    for (let x = marginX; x < width - marginX; x += 3) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 128) continue
      if (r > 248 && g > 248 && b > 248) continue
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`
      const current = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
      current.n += 1
      current.r += r
      current.g += g
      current.b += b
      buckets.set(key, current)
    }
  }

  let best = null
  for (const bucket of buckets.values()) {
    if (!best || bucket.n > best.n) best = bucket
  }
  if (!best) return null
  return chroma(best.r / best.n, best.g / best.n, best.b / best.n).hex()
}
