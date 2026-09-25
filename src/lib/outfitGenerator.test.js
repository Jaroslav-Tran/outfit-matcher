import { describe, expect, it } from 'vitest'
import chroma from 'chroma-js'
import {
  countDistinctNonNeutralColors,
  detectColorScheme,
  distinctNonNeutralHexes,
} from './colorUtils.js'
import { generateOutfits, MAX_COMBINATIONS, rawCombinationCount } from './outfitGenerator.js'

function item(partial) {
  return {
    id: partial.id,
    hex: partial.hex,
    category: partial.category,
    formality: partial.formality || 'casual',
    seasons: partial.seasons || ['spring', 'summer', 'fall', 'winter'],
    isNeutral: partial.isNeutral ?? false,
    label: partial.label || partial.id,
    fit: partial.fit,
  }
}

const palette = [{ id: 'p1', hex: '#4D648F', label: 'Warm Navy' }]

describe('generateOutfits', () => {
  it('returns an empty array for an empty wardrobe and does not throw', () => {
    expect(generateOutfits([], palette)).toEqual([])
    expect(generateOutfits(undefined, palette)).toEqual([])
  })

  it('returns an empty array when a required category is missing', () => {
    const wardrobe = [
      item({ id: 'top-1', hex: '#808080', category: 'top', isNeutral: true }),
      item({ id: 'bottom-1', hex: '#808080', category: 'bottom', isNeutral: true }),
    ]
    expect(generateOutfits(wardrobe, palette)).toEqual([])
  })

  it('defaults missing fit to regular and scores without crashing', () => {
    const wardrobe = [
      item({ id: 'top-1', hex: '#808080', category: 'top', isNeutral: true }),
      item({ id: 'bottom-1', hex: '#808080', category: 'bottom', isNeutral: true }),
      item({ id: 'shoes-1', hex: '#808080', category: 'shoes', isNeutral: true }),
    ]
    const outfits = generateOutfits(wardrobe, palette)
    expect(outfits.length).toBeGreaterThan(0)
    expect(outfits[0].score).toEqual(expect.any(Number))
  })

  it('collapses two hexes with ΔE < 12 into one distinct non-neutral color', () => {
    const items = [
      item({ id: 'a', hex: '#ff0000', category: 'top', isNeutral: false }),
      item({ id: 'b', hex: '#fe0505', category: 'bottom', isNeutral: false }),
    ]
    expect(chroma.deltaE('#ff0000', '#fe0505')).toBeLessThan(12)
    expect(distinctNonNeutralHexes(items)).toHaveLength(1)
    expect(countDistinctNonNeutralColors(items)).toBe(1)
  })

  it('restricts accessory subsets when raw combinations exceed the cap', () => {
    const wardrobe = []
    for (let i = 0; i < 5; i += 1) {
      wardrobe.push(item({ id: `top-${i}`, hex: '#808080', category: 'top', isNeutral: true }))
      wardrobe.push(item({ id: `bottom-${i}`, hex: '#808080', category: 'bottom', isNeutral: true }))
      wardrobe.push(item({ id: `shoes-${i}`, hex: '#808080', category: 'shoes', isNeutral: true }))
    }
    for (let i = 0; i < 30; i += 1) {
      wardrobe.push(
        item({ id: `acc-${i}`, hex: '#808080', category: 'accessory', isNeutral: true }),
      )
    }
    expect(rawCombinationCount(wardrobe, 2)).toBeGreaterThan(MAX_COMBINATIONS)
    expect(rawCombinationCount(wardrobe, 1)).toBeLessThanOrEqual(MAX_COMBINATIONS)
    const outfits = generateOutfits(wardrobe, palette)
    expect(Array.isArray(outfits)).toBe(true)
    expect(outfits.every((look) => look.accessories.length <= 1)).toBe(true)
  })

  it('classifies fixed hue distances as mono, analogous, and complementary', () => {
    const red = chroma.hsl(0, 0.7, 0.45).hex()
    expect(detectColorScheme([red, chroma.hsl(10, 0.7, 0.45).hex()])).toBe('monochromatic')
    expect(detectColorScheme([red, chroma.hsl(40, 0.7, 0.45).hex()])).toBe('analogous')
    expect(detectColorScheme([red, chroma.hsl(180, 0.7, 0.45).hex()])).toBe('complementary')
  })

  it('returns an empty array when the formality filter matches nothing', () => {
    const wardrobe = [
      item({ id: 'top-1', hex: '#808080', category: 'top', isNeutral: true, formality: 'casual' }),
      item({
        id: 'bottom-1',
        hex: '#808080',
        category: 'bottom',
        isNeutral: true,
        formality: 'casual',
      }),
      item({
        id: 'shoes-1',
        hex: '#808080',
        category: 'shoes',
        isNeutral: true,
        formality: 'casual',
      }),
    ]
    expect(generateOutfits(wardrobe, palette, 'formal')).toEqual([])
  })
})
