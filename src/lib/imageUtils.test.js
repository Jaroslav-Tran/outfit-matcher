import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { createSampleData } from './sampleData.js'
import { isLikelyHeic, solidColorPngBytes } from './imageUtils.js'

describe('isLikelyHeic', () => {
  it('detects MIME types', () => {
    expect(isLikelyHeic({ type: 'image/heic', name: 'x.jpg' })).toBe(true)
    expect(isLikelyHeic({ type: 'image/heif', name: 'x' })).toBe(true)
    expect(isLikelyHeic({ type: 'image/jpeg', name: 'x.jpg' })).toBe(false)
  })

  it('detects extensions when MIME is empty (common on iOS)', () => {
    expect(isLikelyHeic({ type: '', name: 'IMG_1234.HEIC' })).toBe(true)
    expect(isLikelyHeic({ type: '', name: 'shot.heif' })).toBe(true)
    expect(isLikelyHeic({ type: '', name: 'shot.jpeg' })).toBe(false)
  })
})

describe('solidColorPngBytes', () => {
  it('writes a PNG whose first pixel is the requested color', () => {
    const bytes = solidColorPngBytes('#735742', 2)
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    const idat = pngChunk(bytes, 'IDAT')
    const raw = inflateSync(idat)
    expect(Array.from(raw.slice(0, 4))).toEqual([0, 0x73, 0x57, 0x42])
  })
})

describe('createSampleData photos', () => {
  it('uses PNG placeholders instead of SVG', () => {
    const sample = createSampleData()
    expect(sample.wardrobe.length).toBeGreaterThan(0)
    for (const piece of sample.wardrobe) {
      expect(piece.imageUrl.startsWith('data:image/png;base64,')).toBe(true)
      expect(piece.imageUrl.includes('svg')).toBe(false)
    }
  })
})

function pngChunk(bytes, type) {
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset)
    const length = view.getUint32(0)
    const name = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
    const data = bytes.slice(offset + 8, offset + 8 + length)
    if (name === type) return data
    offset += 12 + length
  }
  throw new Error(`missing ${type}`)
}
