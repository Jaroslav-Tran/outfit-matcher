import { describe, expect, it } from 'vitest'
import chroma from 'chroma-js'
import {
  countDistinctNonNeutralColors,
  detectColorScheme,
  distinctNonNeutralHexes,
} from './colorUtils.js'
import { normalizeCategories } from './constants.js'
import { annotateWardrobeWithPalette } from './colorUtils.js'
import {
  analyzeLayerStyle,
  comboComfortPenalty,
  comboHasDuplicateSlots,
  generateOutfits,
  localDateISO,
  MAX_COMBINATIONS,
  outerwearFormalityAllowed,
  palettePointsForItem,
  passesFormalityFilter,
  rawCombinationCount,
  recencyPenalty,
} from './outfitGenerator.js'
import { DEFAULT_PALETTE } from './sampleData.js'
import { bandFromTempC } from './weather.js'

function item(partial) {
  return {
    id: partial.id,
    hex: partial.hex || '#808080',
    category: partial.category,
    formality: partial.formality || 'casual',
    seasons: partial.seasons || ['spring', 'summer', 'fall', 'winter'],
    isNeutral: partial.isNeutral ?? false,
    label: partial.label || partial.id,
    fit: partial.fit,
    warmth: partial.warmth ?? null,
    length: partial.length ?? null,
    lastWorn: partial.lastWorn ?? null,
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

  it('applies soft recency penalties without excluding recently worn items', () => {
    expect(recencyPenalty(null)).toBe(0)
    expect(recencyPenalty('2099-01-01', '2099-01-01')).toBe(-5)
    expect(recencyPenalty('2099-01-01', '2099-01-03')).toBe(-5)
    expect(recencyPenalty('2099-01-01', '2099-01-04')).toBe(-2)
    expect(recencyPenalty('2099-01-01', '2099-01-06')).toBe(-2)
    expect(recencyPenalty('2099-01-01', '2099-01-07')).toBe(0)

    const fresh = [
      item({ id: 'top-1', hex: '#808080', category: 'top', isNeutral: true }),
      item({ id: 'bottom-1', hex: '#808080', category: 'bottom', isNeutral: true }),
      item({ id: 'shoes-1', hex: '#808080', category: 'shoes', isNeutral: true }),
    ]
    const wornToday = fresh.map((entry) => ({ ...entry, lastWorn: localDateISO() }))
    const freshScore = generateOutfits(fresh, palette)[0].score
    const wornScore = generateOutfits(wornToday, palette)[0].score
    expect(wornScore).toBe(freshScore - 15)
    expect(generateOutfits(wornToday, palette).length).toBeGreaterThan(0)
  })

  it('applies a soft weather bonus without excluding off-band items', () => {
    expect(bandFromTempC(5)).toBe('cold')
    expect(bandFromTempC(15)).toBe('mild')
    expect(bandFromTempC(25)).toBe('hot')

    const wardrobe = [
      item({
        id: 'top-winter',
        hex: '#808080',
        category: 'top',
        isNeutral: true,
        seasons: ['winter'],
      }),
      item({
        id: 'bottom-1',
        hex: '#808080',
        category: 'bottom',
        isNeutral: true,
        seasons: ['winter', 'spring', 'summer', 'fall'],
      }),
      item({
        id: 'shoes-1',
        hex: '#808080',
        category: 'shoes',
        isNeutral: true,
        seasons: ['winter', 'spring', 'summer', 'fall'],
      }),
      item({
        id: 'top-summer',
        hex: '#808080',
        category: 'top',
        isNeutral: true,
        seasons: ['summer'],
        label: 'summer top',
      }),
    ]
    const without = generateOutfits(wardrobe, palette)
    const withCold = generateOutfits(wardrobe, palette, 'any', 'any', ['winter'])
    expect(without.length).toBeGreaterThan(0)
    expect(withCold.length).toBeGreaterThan(0)
    expect(withCold[0].score).toBeGreaterThan(without[0].score)
  })

  it('applies no warmth-grading penalty when warmth increases outward', () => {
    const top = item({ id: 't', category: 'top', warmth: 'light', length: 'regular' })
    const mid = item({ id: 'm', category: 'mid-layer', warmth: 'medium', length: 'regular' })
    const outer = item({ id: 'o', category: 'outerwear', warmth: 'heavy', length: 'long' })
    const combo = { top, midLayer: mid, outerwear: outer }
    expect(analyzeLayerStyle(combo).warmthGradingPenalty).toBe(false)
  })

  it('applies warmth-grading penalty when an outer layer is lighter than the layer inside', () => {
    const top = item({ id: 't', category: 'top', warmth: 'heavy', length: 'regular' })
    const mid = item({ id: 'm', category: 'mid-layer', warmth: 'light', length: 'regular' })
    const combo = { top, midLayer: mid, outerwear: null }
    expect(analyzeLayerStyle(combo).warmthGradingPenalty).toBe(true)
    expect(analyzeLayerStyle(combo).extraScore).toBeLessThan(0)
  })

  it('applies bulk-cap penalty when two layer-stack pieces are heavy', () => {
    const top = item({ id: 't', category: 'top', warmth: 'heavy' })
    const mid = item({ id: 'm', category: 'mid-layer', warmth: 'heavy' })
    const combo = { top, midLayer: mid, outerwear: null }
    expect(analyzeLayerStyle(combo).heavyBulkPenalty).toBe(true)
  })

  it('allows outerwear one formality tier above the top but not below or two above', () => {
    expect(outerwearFormalityAllowed('casual', 'smart-casual')).toBe(true)
    expect(outerwearFormalityAllowed('casual', 'formal')).toBe(false)
    expect(outerwearFormalityAllowed('smart-casual', 'casual')).toBe(false)

    const base = {
      top: item({ id: 't', category: 'top', formality: 'casual' }),
      bottom: item({ id: 'b', category: 'bottom', formality: 'casual' }),
      shoes: item({ id: 's', category: 'shoes', formality: 'casual' }),
      midLayer: null,
      accessories: [],
    }
    expect(
      passesFormalityFilter(
        {
          ...base,
          outerwear: item({ id: 'o', category: 'outerwear', formality: 'smart-casual' }),
        },
        'any',
      ),
    ).toBe(true)
    expect(
      passesFormalityFilter(
        {
          ...base,
          outerwear: item({ id: 'o2', category: 'outerwear', formality: 'formal' }),
        },
        'any',
      ),
    ).toBe(false)
  })

  it('penalizes a three-layer stack more than a one-layer stack in a hot band', () => {
    const top = item({ id: 'top-1', category: 'top', warmth: 'light', isNeutral: true })
    const mid = item({ id: 'mid-1', category: 'mid-layer', warmth: 'medium', isNeutral: true })
    const outer = item({ id: 'outer-1', category: 'outerwear', warmth: 'heavy', isNeutral: true })
    const oneLayer = { top, midLayer: null, outerwear: null }
    const threeLayer = { top, midLayer: mid, outerwear: outer }
    expect(comboComfortPenalty(threeLayer, 'hot')).toBeLessThan(
      comboComfortPenalty(oneLayer, 'hot'),
    )
  })

  it('treats null warmth and length as medium and regular without throwing', () => {
    const top = item({ id: 't', category: 'top', warmth: null, length: null })
    const mid = item({ id: 'm', category: 'mid-layer', warmth: null, length: null })
    expect(() => analyzeLayerStyle({ top, midLayer: mid, outerwear: null })).not.toThrow()
  })

  it('includes mid-layer items in generation when tagged mid-layer only', () => {
    const wardrobe = [
      item({ id: 'top-1', category: 'top', isNeutral: true }),
      item({ id: 'bottom-1', category: 'bottom', isNeutral: true }),
      item({ id: 'shoes-1', category: 'shoes', isNeutral: true }),
      item({ id: 'mid-1', category: ['mid-layer'], isNeutral: true, label: 'vest' }),
    ]
    const outfits = generateOutfits(wardrobe, palette)
    expect(outfits.some((look) => look.midLayer?.id === 'mid-1')).toBe(true)
  })

  it('discards combinations where the same item would fill two slots', () => {
    const dual = item({ id: 'dual', category: ['top', 'mid-layer'], isNeutral: true })
    const combo = {
      top: dual,
      bottom: item({ id: 'b', category: 'bottom', isNeutral: true }),
      shoes: item({ id: 's', category: 'shoes', isNeutral: true }),
      midLayer: dual,
      outerwear: null,
      accessories: [],
    }
    expect(comboHasDuplicateSlots(combo)).toBe(true)
  })

  it('normalizes legacy single-value category strings to arrays', () => {
    expect(normalizeCategories('top')).toEqual(['top'])
  })
})

describe('LOGIC-01 palette score includes neutrals', () => {
  const analysisPalette = DEFAULT_PALETTE.map((color, index) => ({
    ...color,
    id: `p-${index}`,
  }))

  it('scores Cream Whisper tee ~+17–20 while Neutral stays budget-free', () => {
    const [cream] = annotateWardrobeWithPalette(
      [
        item({
          id: 'cream',
          hex: '#EEE0D1',
          category: 'top',
          isNeutral: true,
          label: 'Cream Whisper tee',
        }),
      ],
      analysisPalette,
    )
    expect(cream.isNeutral).toBe(true)
    expect(palettePointsForItem(cream)).toBeGreaterThanOrEqual(17)
    expect(palettePointsForItem(cream)).toBeLessThanOrEqual(20)
  })

  it('scores a black tee about 0 palette points while Neutral', () => {
    const [black] = annotateWardrobeWithPalette(
      [item({ id: 'black', hex: '#000000', category: 'top', isNeutral: true })],
      analysisPalette,
    )
    expect(black.isNeutral).toBe(true)
    expect(palettePointsForItem(black)).toBeLessThan(1)
  })
})
