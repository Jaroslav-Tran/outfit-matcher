import { describe, expect, it, vi } from 'vitest'
import { deleteWardrobeItemFlow } from './persistenceDelete.js'

describe('deleteWardrobeItemFlow', () => {
  const item = {
    id: 'item-1',
    imagePath: 'user/item-1.jpg',
    imageUrl: 'blob:http://localhost/preview',
  }

  it('does not call storage when row delete fails', async () => {
    const removeStorage = vi.fn()
    const revokeBlobUrl = vi.fn()
    await expect(
      deleteWardrobeItemFlow({
        item,
        deleteRow: async () => {
          throw new Error('row delete failed')
        },
        removeStorage,
        revokeBlobUrl,
      }),
    ).rejects.toThrow('row delete failed')
    expect(removeStorage).not.toHaveBeenCalled()
    expect(revokeBlobUrl).not.toHaveBeenCalled()
  })

  it('keeps the item deleted and returns orphanedPath when storage fails after row delete', async () => {
    const warn = vi.fn()
    const revokeBlobUrl = vi.fn()
    const result = await deleteWardrobeItemFlow({
      item,
      deleteRow: async () => {},
      removeStorage: async () => {
        throw new Error('storage remove failed')
      },
      revokeBlobUrl,
      warn,
    })
    expect(result).toEqual({ orphanedPath: 'user/item-1.jpg' })
    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:http://localhost/preview')
    expect(warn).toHaveBeenCalled()
  })

  it('returns empty object when row and storage both succeed', async () => {
    const removeStorage = vi.fn(async () => {})
    const revokeBlobUrl = vi.fn()
    const result = await deleteWardrobeItemFlow({
      item,
      deleteRow: async () => {},
      removeStorage,
      revokeBlobUrl,
    })
    expect(result).toEqual({})
    expect(removeStorage).toHaveBeenCalledWith('user/item-1.jpg')
    expect(revokeBlobUrl).toHaveBeenCalledWith('blob:http://localhost/preview')
  })
})
