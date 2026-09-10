import { supabase } from './supabase.js'
import { CATEGORIES, FITS, FORMALITIES, SEASONS } from './constants.js'

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(reader.error || new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

export async function suggestTagsFromPhoto(blob) {
  if (!supabase) return null
  try {
    const imageBase64 = await blobToBase64(blob)
    const { data, error } = await supabase.functions.invoke('suggest-garment', {
      body: { imageBase64, mimeType: blob.type || 'image/jpeg' },
    })
    if (error || !data || data.error) return null

    const category = CATEGORIES.includes(data.category) ? data.category : null
    const formality = FORMALITIES.includes(data.formality) ? data.formality : null
    const fit = FITS.includes(data.fit) ? data.fit : null
    const seasons = Array.isArray(data.seasons)
      ? data.seasons.filter((season) => SEASONS.includes(season))
      : []
    const label = typeof data.label === 'string' ? data.label.trim() : ''

    return { category, formality, fit, seasons, label }
  } catch {
    return null
  }
}
