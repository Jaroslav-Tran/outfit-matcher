import { describe, expect, it } from 'vitest'
import {
  countDistinctNonNeutralColors,
  dedupePaletteColors,
  detectColorScheme,
  isLowChroma,
  isSuggestedNeutral,
  normalizePaletteHex,
  paletteHasHex,
} from './colorUtils.js'

describe('normalizePaletteHex', () => {
  it('lowercases and keeps a leading hash', () => {
    expect(normalizePaletteHex('#D5BBA7')).toBe('#d5bba7')
  })

  it('treats missing hash and short forms as the same rgb', () => {
    expect(normalizePaletteHex('D5BBA7')).toBe('#d5bba7')
    expect(normalizePaletteHex('#abc')).toBe('#aabbcc')
  })
})

describe('dedupePaletteColors', () => {
  it('keeps the first entry for each hex ignoring case', () => {
    const result = dedupePaletteColors([
      { id: '1', hex: '#D5BBA7', label: 'Warm Sand' },
      { id: '2', hex: '#d5bba7', label: 'Duplicate' },
      { id: '3', hex: '#708A6D', label: 'Deep Sage' },
    ])
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ id: '1', hex: '#d5bba7', label: 'Warm Sand' })
    expect(result[1]).toEqual({ id: '3', hex: '#708a6d', label: 'Deep Sage' })
  })
})

describe('paletteHasHex', () => {
  it('matches across casing', () => {
    const palette = [{ id: '1', hex: '#d5bba7' }]
    expect(paletteHasHex('#D5BBA7', palette)).toBe(true)
    expect(paletteHasHex('#708A6D', palette)).toBe(false)
  })
})

describe('LOGIC-05 achromatic colors', () => {
  it('treats low-chroma greys as suggested neutrals', () => {
    expect(isLowChroma('#808080')).toBe(true)
    expect(isSuggestedNeutral('#808080')).toBe(true)
    expect(isSuggestedNeutral('#c0c0c0')).toBe(true)
  })

  it('classifies two unflagged greys as monochromatic, not unclassified', () => {
    expect(detectColorScheme(['#808080', '#c0c0c0'])).toBe('monochromatic')
  })

  it('classifies grey + one hue as monochromatic', () => {
    expect(detectColorScheme(['#808080', '#e74c3c'])).toBe('monochromatic')
  })

  it('applies normal hue rules when grey accompanies two chromatic hues', () => {
    // red vs teal-ish complementary-ish; include a grey that must be ignored for hue
    const scheme = detectColorScheme(['#808080', '#e74c3c', '#1abc9c'])
    expect(['analogous', 'complementary', 'monochromatic', 'unclassified']).toContain(scheme)
    // Without grey, red (#e74c3c ~0°) vs teal (#1abc9c ~168°) → complementary band
    expect(detectColorScheme(['#e74c3c', '#1abc9c'])).toBe('complementary')
    expect(detectColorScheme(['#808080', '#e74c3c', '#1abc9c'])).toBe('complementary')
  })
})

describe('LOGIC-06 distinct non-neutral count', () => {
  it('returns the same count for a non-transitive triple in all orderings', () => {
    // A≈B and B≈C (ΔE < 12) but A≉C (ΔE ≥ 12) — union-find → 1 component.
    const A = '#ff0000'
    const B = '#c70505'
    const C = '#8b0404'
    const items = (hexes) =>
      hexes.map((hex, i) => ({ id: String(i), hex, isNeutral: false }))

    const orders = [
      [A, B, C],
      [A, C, B],
      [B, A, C],
      [B, C, A],
      [C, A, B],
      [C, B, A],
    ]
    const counts = orders.map((order) => countDistinctNonNeutralColors(items(order)))
    expect(new Set(counts).size).toBe(1)
    expect(counts[0]).toBe(1)
  })
})
