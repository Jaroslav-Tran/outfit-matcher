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

/** Canonical palette hex: lowercase #rrggbb (or null if invalid). */
export function normalizePaletteHex(value) {
  const viaChroma = toHex(value)
  if (viaChroma) return viaChroma
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return null
}

/** Keep first color for each normalized hex; drop later duplicates. */
export function dedupePaletteColors(colors) {
  if (!colors?.length) return []
  const seen = new Set()
  const unique = []
  for (const color of colors) {
    const hex = normalizePaletteHex(typeof color === 'string' ? color : color.hex)
    if (!hex) {
      unique.push(color)
      continue
    }
    if (seen.has(hex)) continue
    seen.add(hex)
    unique.push(typeof color === 'string' ? hex : { ...color, hex })
  }
  return unique
}

/** Negligible chroma (LCH C < 8) — no reliable hue for scheme detection. */
export const LOW_CHROMA_THRESHOLD = 8

export function isLowChroma(hex) {
  if (!isValidHex(hex)) return false
  const chromaValue = chroma(hex).get('lch.c')
  return Number.isFinite(chromaValue) && chromaValue < LOW_CHROMA_THRESHOLD
}

export function isSuggestedNeutral(hex) {
  if (!isValidHex(hex)) return false
  if (isLowChroma(hex)) return true
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

  // Drop hue-less / low-chroma colors from hue comparison; they still occupy
  // the color budget when not flagged Neutral (handled by the caller).
  const chromatic = hexes.filter((hex) => !isLowChroma(hex) && Number.isFinite(hueOf(hex)))
  if (chromatic.length <= 1) return 'monochromatic'
  if (chromatic.length !== 2) return 'unclassified'

  const h1 = hueOf(chromatic[0])
  const h2 = hueOf(chromatic[1])
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

/**
 * Distinct non-neutral colors via connected components (union-find) on ΔE < 12.
 * Order-independent: A≈B and B≈C imply one component even when A≉C.
 */
export function distinctNonNeutralHexes(items) {
  const hexes = (items || [])
    .filter((entry) => !entry.isNeutral && isValidHex(entry.hex))
    .map((entry) => toHex(entry.hex) || entry.hex)
  if (!hexes.length) return []

  const parent = hexes.map((_, i) => i)
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  function union(a, b) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent[rb] = ra
  }

  for (let i = 0; i < hexes.length; i += 1) {
    for (let j = i + 1; j < hexes.length; j += 1) {
      if (deltaE(hexes[i], hexes[j]) < SAME_COLOR_DELTA_E) union(i, j)
    }
  }

  const roots = new Map()
  for (let i = 0; i < hexes.length; i += 1) {
    const root = find(i)
    if (!roots.has(root)) roots.set(root, hexes[i])
  }
  return [...roots.values()]
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

export const PALETTE_SNAP_DELTA_E = 18

export function isNearExistingColor(hex, colors, threshold = SAME_COLOR_DELTA_E) {
  if (!isValidHex(hex) || !colors?.length) return false
  return colors.some((color) => {
    const other = typeof color === 'string' ? color : color.hex
    return deltaE(hex, other) < threshold
  })
}

/** Exact hex match after normalization (e.g. #C08081 → #c08081). */
export function findPaletteColorByHex(hex, colors) {
  const normalized = normalizePaletteHex(hex)
  if (!normalized || !colors?.length) return null
  return (
    colors.find((color) => {
      const other = typeof color === 'string' ? color : color.hex
      return normalizePaletteHex(other) === normalized
    }) || null
  )
}

export function paletteHasHex(hex, colors) {
  return Boolean(findPaletteColorByHex(hex, colors))
}


function extractDominantColors(imageData, options = {}) {
  if (!imageData?.data?.length) return []
  const {
    maxColors = 12,
    marginRatio = 0.04,
    step = 2,
    skipNearWhite = true,
    skipNearBlack = false,
    minShare = 0.003,
  } = options

  const { data, width, height } = imageData
  const buckets = new Map()
  const marginX = Math.floor(width * marginRatio)
  const marginY = Math.floor(height * marginRatio)
  let sampled = 0

  for (let y = marginY; y < height - marginY; y += step) {
    for (let x = marginX; x < width - marginX; x += step) {
      const i = (y * width + x) * 4
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const a = data[i + 3]
      if (a < 128) continue
      if (skipNearWhite && r > 246 && g > 246 && b > 246) continue
      if (skipNearBlack && r < 18 && g < 18 && b < 18) continue
      sampled += 1
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`
      const current = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 }
      current.n += 1
      current.r += r
      current.g += g
      current.b += b
      buckets.set(key, current)
    }
  }

  if (!sampled) return []

  const candidates = []
  for (const bucket of buckets.values()) {
    const share = bucket.n / sampled
    if (share < minShare) continue
    const hex = chroma(bucket.r / bucket.n, bucket.g / bucket.n, bucket.b / bucket.n).hex()
    const sat = chroma(hex).get('hsl.s') || 0
    candidates.push({
      hex,
      n: bucket.n,
      share,
      score: bucket.n * (0.35 + sat),
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  const merged = []
  for (const color of candidates) {
    const existing = merged.find((entry) => deltaE(entry.hex, color.hex) < SAME_COLOR_DELTA_E)
    if (existing) {
      existing.n += color.n
      existing.share += color.share
      existing.score += color.score
      continue
    }
    merged.push({ ...color })
  }

  return merged
    .sort((a, b) => b.score - a.score)
    .slice(0, maxColors)
    .map(({ hex, share }) => ({ hex, share }))
}

export function extractPaletteFromImageData(imageData) {
  return extractDominantColors(imageData, {
    maxColors: 16,
    marginRatio: 0.02,
    step: 2,
    skipNearWhite: true,
    skipNearBlack: true,
    minShare: 0.004,
  })
}

export function extractGarmentColors(imageData) {
  return extractDominantColors(imageData, {
    maxColors: 4,
    marginRatio: 0.16,
    step: 3,
    skipNearWhite: true,
    skipNearBlack: false,
    minShare: 0.02,
  })
}

export function suggestHexFromImageData(imageData) {
  return extractGarmentColors(imageData)[0]?.hex || null
}

export function suggestClothHex(photoHex, palette) {
  if (!isValidHex(photoHex)) {
    return { hex: null, source: 'photo', match: null, deltaE: Infinity }
  }
  const match = findClosestPaletteColor(photoHex, palette)
  if (match.closestPaletteMatch && match.deltaE < PALETTE_SNAP_DELTA_E) {
    return {
      hex: match.closestPaletteMatch.hex,
      source: 'palette',
      match: match.closestPaletteMatch,
      deltaE: match.deltaE,
    }
  }
  return {
    hex: toHex(photoHex),
    source: 'photo',
    match: match.closestPaletteMatch,
    deltaE: match.deltaE,
  }
}
