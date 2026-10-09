import { supabase } from './supabase.js'
import { revokeIfBlobUrl } from './imageUtils.js'
import { normalizeCategories } from './constants.js'
import { normalizePaletteHex, paletteHasHex } from './colorUtils.js'
import { deleteWardrobeItemFlow } from './persistenceDelete.js'
import { filterNewSampleWardrobe } from './sampleAppend.js'

const BUCKET = 'wardrobe'

function paletteReferencePath(userId) {
  return `${userId}/palette-reference.jpg`
}

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

  const kept = []
  const seen = new Set()
  const duplicateIds = []

  for (const row of data || []) {
    const hex = normalizePaletteHex(row.hex)
    if (!hex) {
      kept.push({
        id: row.id,
        hex: row.hex,
        label: row.label || undefined,
      })
      continue
    }
    if (seen.has(hex)) {
      duplicateIds.push(row.id)
      continue
    }
    seen.add(hex)
    kept.push({
      id: row.id,
      hex,
      label: row.label || undefined,
    })
  }

  if (duplicateIds.length) {
    const { error: deleteError } = await supabase
      .from('palette_colors')
      .delete()
      .eq('user_id', userId)
      .in('id', duplicateIds)
    throwIfError(deleteError)
  }

  return kept
}

export async function insertPaletteColor(userId, color) {
  const hex = normalizePaletteHex(color.hex)
  if (!hex) throw new Error('Enter a valid hex color.')
  const existing = await loadPalette(userId)
  if (paletteHasHex(hex, existing)) {
    throw new Error('That color is already in your palette.')
  }
  const { error } = await supabase.from('palette_colors').insert({
    id: color.id,
    user_id: userId,
    hex,
    label: color.label || null,
  })
  throwIfError(error)
}

export async function insertPaletteColors(userId, colors) {
  if (!colors?.length) return []
  const existing = await loadPalette(userId)
  const seen = new Set(existing.map((entry) => normalizePaletteHex(entry.hex)).filter(Boolean))
  const rows = []
  const inserted = []
  for (const color of colors) {
    const hex = normalizePaletteHex(color.hex)
    if (!hex || seen.has(hex)) continue
    seen.add(hex)
    rows.push({
      id: color.id,
      user_id: userId,
      hex,
      label: color.label || null,
    })
    inserted.push({ ...color, hex })
  }
  if (!rows.length) return []
  const { error } = await supabase.from('palette_colors').insert(rows)
  throwIfError(error)
  return inserted
}

export async function deletePaletteColor(userId, id) {
  const { error } = await supabase.from('palette_colors').delete().eq('user_id', userId).eq('id', id)
  throwIfError(error)
}

export async function loadPaletteReference(userId) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(paletteReferencePath(userId), 60 * 60 * 24 * 7)
  if (error || !data?.signedUrl) return ''
  return data.signedUrl
}

export async function savePaletteReference(userId, blob) {
  const path = paletteReferencePath(userId)
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    upsert: true,
  })
  throwIfError(error)
  return signUrl(path)
}

function rowToItem(row, imageUrl) {
  const categories = normalizeCategories(row.category)
  return {
    id: row.id,
    hex: row.hex,
    category: categories.length ? categories : ['top'],
    formality: row.formality,
    fit: row.fit || 'regular',
    warmth: row.warmth || null,
    length: row.length || null,
    seasons: row.seasons || [],
    isNeutral: row.is_neutral,
    label: row.label || undefined,
    imagePath: row.image_path,
    lastWorn: row.last_worn || null,
    imageUrl,
  }
}

export async function loadWardrobe(userId) {
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select(
      'id, hex, category, formality, fit, warmth, length, seasons, is_neutral, label, image_path, last_worn',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  throwIfError(error)

  return Promise.all(
    (data || []).map(async (row) => rowToItem(row, await signUrl(row.image_path))),
  )
}

export async function insertWardrobeItem(userId, item, blob) {
  const { ext, contentType } = extensionFor(blob)
  // Storage RLS: first folder must be auth.uid(). Item id is a UUID from the client.
  const path = `${userId}/${item.id}.${ext}`
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType,
    upsert: true,
  })
  throwIfError(uploadError)

  try {
    const categories = normalizeCategories(item.category)
    if (!categories.length) throw new Error('Tag at least one category.')
    const { error } = await supabase.from('wardrobe_items').upsert(
      {
        id: item.id,
        user_id: userId,
        hex: item.hex,
        category: categories,
        formality: item.formality,
        fit: item.fit || 'regular',
        warmth: item.warmth || null,
        length: item.length || null,
        seasons: item.seasons || [],
        is_neutral: Boolean(item.isNeutral),
        label: item.label || null,
        image_path: path,
      },
      { onConflict: 'id' },
    )
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
  if ('category' in patch) {
    const categories = normalizeCategories(patch.category)
    if (!categories.length) throw new Error('Tag at least one category.')
    row.category = categories
  }
  if ('formality' in patch) row.formality = patch.formality
  if ('warmth' in patch) row.warmth = patch.warmth || null
  if ('length' in patch) row.length = patch.length || null
  if ('lastWorn' in patch) row.last_worn = patch.lastWorn
  if (!Object.keys(row).length) return
  const { error } = await supabase
    .from('wardrobe_items')
    .update(row)
    .eq('user_id', userId)
    .eq('id', id)
  throwIfError(error)
}

export async function markItemsWorn(userId, itemIds, wornDate) {
  if (!itemIds?.length) return
  const { error } = await supabase
    .from('wardrobe_items')
    .update({ last_worn: wornDate })
    .eq('user_id', userId)
    .in('id', itemIds)
  throwIfError(error)
}

export async function deleteWardrobeItemRow(userId, item) {
  return deleteWardrobeItemFlow({
    item,
    deleteRow: async () => {
      const { error } = await supabase
        .from('wardrobe_items')
        .delete()
        .eq('user_id', userId)
        .eq('id', item.id)
      throwIfError(error)
    },
    removeStorage: async (path) => {
      const { error } = await supabase.storage.from(BUCKET).remove([path])
      throwIfError(error)
    },
    revokeBlobUrl: revokeIfBlobUrl,
  })
}

export async function appendSampleData(userId, existingPalette, existingWardrobe, sample) {
  const seen = new Set(
    existingPalette.map((color) => normalizePaletteHex(color.hex)).filter(Boolean),
  )
  const colorsToAdd = []
  for (const color of sample.palette || []) {
    const hex = normalizePaletteHex(color.hex)
    if (!hex || seen.has(hex)) continue
    seen.add(hex)
    colorsToAdd.push({ ...color, hex })
  }
  if (colorsToAdd.length) {
    await insertPaletteColors(userId, colorsToAdd)
  }

  const wardrobeToAdd = filterNewSampleWardrobe(existingWardrobe, sample.wardrobe || [])
  const savedItems = []
  for (const item of wardrobeToAdd) {
    const blob = await blobFromDisplayUrl(item.imageUrl)
    savedItems.push(await insertWardrobeItem(userId, item, blob))
  }

  return {
    palette: [...existingPalette, ...colorsToAdd],
    wardrobe: [...existingWardrobe, ...savedItems],
    addedColors: colorsToAdd.length,
    addedItems: savedItems.length,
  }
}

async function blobFromDisplayUrl(url) {
  const response = await fetch(url)
  const blob = await response.blob()
  if (blob.type && blob.type !== 'application/octet-stream') return blob
  if (url.startsWith('data:image/svg')) return new Blob([blob], { type: 'image/svg+xml' })
  return new Blob([blob], { type: 'image/jpeg' })
}
