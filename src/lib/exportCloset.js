import { supabase } from './supabase.js'

export const EXPORT_SCHEMA_VERSION = 1

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
    .select('id, hex, category, formality, fit, seasons, is_neutral, label, image_path, created_at')
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
