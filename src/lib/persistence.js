import { supabase } from './supabase.js'
import { revokeIfBlobUrl } from './imageUtils.js'

const BUCKET = 'wardrobe'

function throwIfError(error) {
  if (error) throw error
}

function extensionFor(blob) {
  const type = blob?.type || ''
  if (type.includes('png')) return { ext: 'png', contentType: 'image/png' }
  if (type.includes('webp')) return { ext: 'webp', contentType: 'image/webp' }
  if (type.includes('svg')) return { ext: 'svg', contentType: 'image/svg+xml' }
  return { ext: 'jpg', contentType: 'image/jpeg' }
}

export async function signUrl(path) {
  if (!path) return ''
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7)
  throwIfError(error)
  return data.signedUrl
}

export async function loadPalette(userId) {
  const { data, error } = await supabase
    .from('palette_colors')
    .select('id, hex, label')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  throwIfError(error)
  return (data || []).map((row) => ({
    id: row.id,
    hex: row.hex,
    label: row.label || undefined,
  }))
}

export async function insertPaletteColor(userId, color) {
  const { error } = await supabase.from('palette_colors').insert({
    id: color.id,
    user_id: userId,
    hex: color.hex,
    label: color.label || null,
  })
  throwIfError(error)
}

export async function deletePaletteColor(userId, id) {
  const { error } = await supabase.from('palette_colors').delete().eq('user_id', userId).eq('id', id)
  throwIfError(error)
}

function rowToItem(row, imageUrl) {
  return {
    id: row.id,
    hex: row.hex,
    category: row.category,
    formality: row.formality,
    fit: row.fit || 'regular',
    seasons: row.seasons || [],
    isNeutral: row.is_neutral,
    label: row.label || undefined,
    imagePath: row.image_path,
    imageUrl,
  }
}

export async function loadWardrobe(userId) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('id, hex, category, formality, fit, seasons, is_neutral, label, image_path')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  throwIfError(error)

  return Promise.all(
    (data || []).map(async (row) => rowToItem(row, await signUrl(row.image_path))),
  )
}

export async function insertWardrobeItem(userId, item, blob) {
  const { ext, contentType } = extensionFor(blob)
  const path = `${userId}/${item.id}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  })
  throwIfError(uploadError)

  try {
    const { error } = await supabase.from('wardrobe_items').insert({
      id: item.id,
      user_id: userId,
      hex: item.hex,
      category: item.category,
      formality: item.formality,
      fit: item.fit || 'regular',
      seasons: item.seasons || [],
      is_neutral: Boolean(item.isNeutral),
      label: item.label || null,
      image_path: path,
    })
    throwIfError(error)
  } catch (error) {
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }

  const imageUrl = await signUrl(path)
  revokeIfBlobUrl(item.imageUrl)
  return rowToItem(
    {
      ...item,
      is_neutral: Boolean(item.isNeutral),
      label: item.label || null,
      image_path: path,
    },
    imageUrl,
  )
}

export async function updateWardrobeItemRow(userId, id, patch) {
  const row = {}
  if ('isNeutral' in patch) row.is_neutral = patch.isNeutral
  if ('seasons' in patch) row.seasons = patch.seasons
  if ('fit' in patch) row.fit = patch.fit
  if ('hex' in patch) row.hex = patch.hex
  if ('label' in patch) row.label = patch.label ?? null
  if ('category' in patch) row.category = patch.category
  if ('formality' in patch) row.formality = patch.formality
  if (!Object.keys(row).length) return
  const { error } = await supabase
    .from('wardrobe_items')
    .update(row)
    .eq('user_id', userId)
    .eq('id', id)
  throwIfError(error)
}

export async function deleteWardrobeItemRow(userId, item) {
  if (item.imagePath) {
    await supabase.storage.from(BUCKET).remove([item.imagePath])
  }
  const { error } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', item.id)
  throwIfError(error)
  revokeIfBlobUrl(item.imageUrl)
}

export async function replaceAllData(userId, palette, wardrobe) {
  const { data: existing } = await supabase
    .from('wardrobe_items')
    .select('id, image_path')
    .eq('user_id', userId)
  const paths = (existing || []).map((row) => row.image_path).filter(Boolean)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)

  const { error: wardrobeDeleteError } = await supabase
    .from('wardrobe_items')
    .delete()
    .eq('user_id', userId)
  throwIfError(wardrobeDeleteError)

  const { error: paletteDeleteError } = await supabase
    .from('palette_colors')
    .delete()
    .eq('user_id', userId)
  throwIfError(paletteDeleteError)

  if (palette.length) {
    const { error } = await supabase.from('palette_colors').insert(
      palette.map((color) => ({
        id: color.id,
        user_id: userId,
        hex: color.hex,
        label: color.label || null,
      })),
    )
    throwIfError(error)
  }

  const saved = []
  for (const item of wardrobe) {
    const blob = await blobFromDisplayUrl(item.imageUrl)
    saved.push(await insertWardrobeItem(userId, item, blob))
  }
  return saved
}

async function blobFromDisplayUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  if (blob.type && blob.type !== 'application/octet-stream') return blob
  if (url.startsWith('data:image/svg')) return new Blob([blob], { type: 'image/svg+xml' })
  return new Blob([blob], { type: 'image/jpeg' })
}
