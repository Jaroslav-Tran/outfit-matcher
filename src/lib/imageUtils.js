const MAX_LONG_EDGE = 500

/** True for HEIC/HEIF by MIME or file extension (iOS often leaves type empty). */
export function isLikelyHeic(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  if (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence'
  ) {
    return true
  }
  const name = String(file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

/**
 * Convert HEIC/HEIF to a JPEG Blob when needed (Chrome cannot decode HEIC).
 * Uses a dynamic import so the wasm decoder is only loaded for those files.
 */
export async function ensureDecodableImageBlob(file) {
  if (!file) throw new Error('No image selected')

  if (!isLikelyHeic(file)) return file

  try {
    const { heicTo, isHeic } = await import('heic-to')
    const heic = typeof isHeic === 'function' ? await isHeic(file) : true
    if (!heic) return file

    const jpeg = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.9,
    })
    if (!(jpeg instanceof Blob)) {
      throw new Error('HEIC conversion returned an unexpected result')
    }
    return jpeg
  } catch (error) {
    const detail = error?.message ? ` (${error.message})` : ''
    throw new Error(
      `Could not convert HEIC/HEIF photo. Export as JPEG in Photos/Preview, or try again.${detail}`,
    )
  }
}

export async function fileToResizedImage(file, maxEdge = MAX_LONG_EDGE) {
  const source = await ensureDecodableImageBlob(file)

  let bitmap
  try {
    bitmap = await createImageBitmap(source)
  } catch (error) {
    const detail = error?.message ? ` (${error.message})` : ''
    throw new Error(
      `Could not read that image. Use JPEG, PNG, WebP, or HEIC.${detail}`,
    )
  }

  try {
    const longEdge = Math.max(bitmap.width, bitmap.height)
    const scale = longEdge > maxEdge ? maxEdge / longEdge : 1
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0, width, height)
    const imageData = ctx.getImageData(0, 0, width, height)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result)
          else reject(new Error('Could not encode resized image'))
        },
        'image/jpeg',
        0.85,
      )
    })

    return {
      blob,
      imageData,
      objectUrl: URL.createObjectURL(blob),
    }
  } finally {
    bitmap.close()
  }
}

export async function fileToResizedObjectUrl(file, maxEdge = MAX_LONG_EDGE) {
  const { objectUrl } = await fileToResizedImage(file, maxEdge)
  return objectUrl
}

export function revokeIfBlobUrl(url) {
  if (url && url.startsWith('blob:')) {
    URL.revokeObjectURL(url)
  }
}

const PNG_SIGNATURE = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let c = 0xffffffff
  for (const byte of bytes) {
    c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const typeBytes = Uint8Array.from(type, (char) => char.charCodeAt(0))
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(typeBytes, 4)
  chunk.set(data, 8)
  const crcInput = new Uint8Array(4 + data.length)
  crcInput.set(typeBytes, 0)
  crcInput.set(data, 4)
  view.setUint32(8 + data.length, crc32(crcInput))
  return chunk
}

function adler32(data) {
  let a = 1
  let b = 0
  for (const byte of data) {
    a = (a + byte) % 65521
    b = (b + a) % 65521
  }
  return ((b << 16) | a) >>> 0
}

/** zlib wrapper around uncompressed deflate stored-blocks. */
function zlibStore(data) {
  const parts = [0x78, 0x01]
  let offset = 0
  do {
    const block = Math.min(65535, data.length - offset)
    const last = offset + block >= data.length
    parts.push(last ? 0x01 : 0x00, block & 0xff, (block >> 8) & 0xff)
    const nlen = (~block) & 0xffff
    parts.push(nlen & 0xff, (nlen >> 8) & 0xff)
    for (let i = 0; i < block; i += 1) parts.push(data[offset + i])
    offset += block
  } while (offset < data.length)
  const sum = adler32(data)
  parts.push((sum >>> 24) & 0xff, (sum >>> 16) & 0xff, (sum >>> 8) & 0xff, sum & 0xff)
  return Uint8Array.from(parts)
}

function rgbFromHex(hex) {
  const raw = String(hex || '').trim().replace('#', '')
  const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [128, 128, 128]
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16),
  ]
}

/** Solid RGB PNG. Used for sample-data photos so Storage never receives SVG. */
export function solidColorPngBytes(hex, size = 16) {
  const edge = Math.max(1, Math.min(64, Math.round(size)))
  const [r, g, b] = rgbFromHex(hex)
  const raw = new Uint8Array(edge * (1 + edge * 3))
  for (let y = 0; y < edge; y += 1) {
    const row = y * (1 + edge * 3)
    raw[row] = 0
    for (let x = 0; x < edge; x += 1) {
      const pixel = row + 1 + x * 3
      raw[pixel] = r
      raw[pixel + 1] = g
      raw[pixel + 2] = b
    }
  }

  const ihdr = new Uint8Array(13)
  const ihdrView = new DataView(ihdr.buffer)
  ihdrView.setUint32(0, edge)
  ihdrView.setUint32(4, edge)
  ihdr[8] = 8
  ihdr[9] = 2

  const chunks = [PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', zlibStore(raw)), pngChunk('IEND', new Uint8Array())]
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const png = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    png.set(chunk, offset)
    offset += chunk.length
  }
  return png
}

export function solidColorPngDataUrl(hex, size = 16) {
  const bytes = solidColorPngBytes(hex, size)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return `data:image/png;base64,${btoa(binary)}`
}
