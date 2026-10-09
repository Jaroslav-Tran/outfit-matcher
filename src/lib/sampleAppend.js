import { normalizeCategories } from './constants.js'
import { normalizePaletteHex, toHex } from './colorUtils.js'

export function wardrobeItemDedupeKey(item) {
  const hex = normalizePaletteHex(item?.hex) || toHex(item?.hex) || String(item?.hex || '').toLowerCase()
  const label = String(item?.label || '').trim().toLowerCase()
  const cats = normalizeCategories(item?.category).slice().sort().join(',')
  return `${label}|${hex}|${cats}`
}

export function filterNewSampleWardrobe(existingWardrobe, sampleWardrobe) {
  const seen = new Set((existingWardrobe || []).map(wardrobeItemDedupeKey))
  const items = []
  for (const item of sampleWardrobe || []) {
    const key = wardrobeItemDedupeKey(item)
    if (seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return items
}

/** Sample load is allowed when wardrobe is empty, or always in DEV. */
export function canOfferSampleData(wardrobe, isDev = false) {
  if (isDev) return true
  return !wardrobe?.length
}
