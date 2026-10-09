/**
 * Delete wardrobe row first, then Storage object.
 * A leftover orphan photo is acceptable; a lost photo with a live row is not.
 *
 * @param {{
 *   item: { id: string, imagePath?: string, imageUrl?: string },
 *   deleteRow: () => Promise<void>,
 *   removeStorage: (path: string) => Promise<void>,
 *   revokeBlobUrl?: (url: string | undefined) => void,
 *   warn?: (...args: unknown[]) => void,
 * }} opts
 * @returns {Promise<{ orphanedPath?: string }>}
 */
export async function deleteWardrobeItemFlow({
  item,
  deleteRow,
  removeStorage,
  revokeBlobUrl = () => {},
  warn = console.warn,
}) {
  await deleteRow()
  revokeBlobUrl(item.imageUrl)

  if (!item.imagePath) return {}

  try {
    await removeStorage(item.imagePath)
    return {}
  } catch (error) {
    warn(
      'Wardrobe row deleted but Storage remove failed; orphaned path:',
      item.imagePath,
      error,
    )
    return { orphanedPath: item.imagePath }
  }
}
