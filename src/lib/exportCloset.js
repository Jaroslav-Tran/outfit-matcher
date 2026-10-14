import { itemFitsSeason, itemHasCategory } from './constants.js'
import { supabase } from './supabase.js'

export const EXPORT_SCHEMA_VERSION = 1

export const WARDROBE_EXPORT_FIELDS = [
  'id',
  'hex',
  'label',
  'category',
  'formality',
  'fit',
  'warmth',
  'length',
  'seasons',
  'is_neutral',
  'image_path',
  'last_worn',
  'created_at',
]

export function wardrobeMatchesExportFilters(item, filters = {}) {
  const categories = filters.categories || []
  const formalities = filters.formalities || []
  const seasons = filters.seasons || []
  const warmths = filters.warmths || []
  if (categories.length && !categories.some((category) => itemHasCategory(item, category))) {
    return false
  }
  if (formalities.length && !formalities.includes(item.formality)) return false
  if (seasons.length && !seasons.some((season) => itemFitsSeason(item, season))) return false
  if (warmths.length && !warmths.includes(item.warmth || 'unset')) return false
  return true
}

export function projectWardrobeRow(item, fields) {
  const allowed = new Set(fields?.length ? fields : WARDROBE_EXPORT_FIELDS)
  const row = {}
  for (const field of WARDROBE_EXPORT_FIELDS) {
    if (!allowed.has(field)) continue
    if (item && field in item) row[field] = item[field]
  }
  return row
}

export function shapeClosetExport(payload, options = {}) {
  const fields = options.fields?.length ? options.fields : WARDROBE_EXPORT_FIELDS
  const filters = {
    categories: options.categories || [],
    formalities: options.formalities || [],
    seasons: options.seasons || [],
    warmths: options.warmths || [],
  }
  const wardrobe = (payload?.wardrobe || [])
    .filter((item) => wardrobeMatchesExportFilters(item, filters))
    .map((item) => projectWardrobeRow(item, fields))
  return {
    schema_version: payload?.schema_version || EXPORT_SCHEMA_VERSION,
    exported_at: payload?.exported_at || new Date().toISOString(),
    filters,
    palette: options.includePalette === false ? [] : payload?.palette || [],
    wardrobe,
  }
}

export async function fetchClosetExport(userId) {
  if (!supabase || !userId) {
    throw new Error('Sign in required to export.')
  }

  const { data: palette, error: paletteError } = await supabase
    .from('palette_colors')
    .select('id, hex, label, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (paletteError) throw paletteError

  const { data: wardrobe, error: wardrobeError } = await supabase
    .from('wardrobe_items')
    .select(
      'id, hex, category, formality, fit, warmth, length, seasons, is_neutral, label, image_path, last_worn, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (wardrobeError) throw wardrobeError

  return {
    schema_version: EXPORT_SCHEMA_VERSION,
    exported_at: new Date().toISOString(),
    palette: palette || [],
    wardrobe: wardrobe || [],
  }
}

export function exportFilename(exportedAt = new Date()) {
  const day = exportedAt.toISOString().slice(0, 10)
  return `outfit-matcher-export-${day}.json`
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
