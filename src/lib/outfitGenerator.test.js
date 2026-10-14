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
  emptyOutfitMessage,
  generateOutfits,
  localDateISO,
  MAX_COMBINATIONS,
  outerwearFormalityAllowed,
  palettePointsForItem,
  passesFormalityFilter,
  planEnumerationLimits,
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
    expect(emptyOutfitMessage(wardrobe)).toBe('Not enough matching pieces yet — add shoes.')
  })

  it('names every missing required slot, including a season that filters shoes out', () => {
    expect(emptyOutfitMessage([])).toBe(
      'Not enough matching pieces yet — add a top, a bottom, and shoes.',
    )
    expect(
      emptyOutfitMessage([item({ id: 'bottom-1', category: 'bottom' })]).endsWith('add a top and shoes.'),
    ).toBe(true)
    const summerCloset = [
      item({ id: 'top-1', category: 'top', seasons: ['summer'] }),
      item({ id: 'bottom-1', category: 'bottom', seasons: ['summer'] }),
      item({ id: 'shoes-1', category: 'shoes', seasons: ['winter'] }),
    ]
    expect(emptyOutfitMessage(summerCloset, 'any', 'summer')).toBe(
      'Not enough matching pieces yet — add shoes for summer.',
    )
  })

  it('names the formality slots that do not match the filter', () => {
    const casual = [
      item({ id: 'top-1', category: 'top', formality: 'casual' }),
      item({ id: 'bottom-1', category: 'bottom', formality: 'casual' }),
      item({ id: 'shoes-1', category: 'shoes', formality: 'casual' }),
    ]
    expect(emptyOutfitMessage(casual, 'formal')).toBe(
      'No formal tops, bottoms, or shoes match this filter.',
    )
    const missingFormalShoes = [
      item({ id: 'top-1', category: 'top', formality: 'formal' }),
      item({ id: 'bottom-1', category: 'bottom', formality: 'formal' }),
      item({ id: 'shoes-1', category: 'shoes', formality: 'casual' }),
    ]
    expect(emptyOutfitMessage(missingFormalShoes, 'formal')).toBe(
      'No formal shoes match this filter.',
    )
  })

  it('keeps the generic sentence when slots exist but the scheme is discarded', () => {
    const top = chroma.hsl(0, 0.7, 0.45).hex()
    const bottom = chroma.hsl(100, 0.7, 0.45).hex()
    const wardrobe = [
      item({ id: 'top-1', hex: top, category: 'top', isNeutral: false }),
      item({ id: 'bottom-1', hex: bottom, category: 'bottom', isNeutral: false }),
      item({ id: 'shoes-1', hex: '#111111', category: 'shoes', isNeutral: true }),
    ]
    expect(generateOutfits(wardrobe, palette)).toEqual([])
    expect(emptyOutfitMessage(wardrobe)).toBe(
      'Not enough matching pieces yet — add more items or relax the formality or season filter',
    )
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

  it('restricts accessory subsets when pruned estimate exceeds the cap', () => {
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

describe('LOOP-02 mid-layer explanation', () => {
  it('mentions the mid-layer cuff tip only once in a neutral-only look', () => {
    const wardrobe = [
      item({ id: 'top-1', hex: '#808080', category: 'top', isNeutral: true, label: 'tee' }),
      item({
        id: 'bottom-1',
        hex: '#808080',
        category: 'bottom',
        isNeutral: true,
        label: 'pants',
      }),
      item({
        id: 'shoes-1',
        hex: '#808080',
        category: 'shoes',
        isNeutral: true,
        label: 'sneakers',
      }),
      item({
        id: 'mid-1',
        hex: '#808080',
        category: 'mid-layer',
        isNeutral: true,
        label: 'cardigan',
      }),
    ]
    const outfits = generateOutfits(wardrobe, [])
    const neutral = outfits.find((o) => o.colorScheme === 'neutral-only')
    expect(neutral).toBeTruthy()
    const needle = 'show slightly at the cuff or collar'
    const matches = neutral.explanation.split(needle).length - 1
    expect(matches).toBe(1)
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

describe('LOOP-01 pruned enumeration', () => {
  it('still finds the only valid outfit when it uses last-added items on an over-cap closet', () => {
    const wardrobe = []
    // Many formal pieces first (no complete formal set — missing formal shoes).
    for (let i = 0; i < 40; i += 1) {
      wardrobe.push(
        item({
          id: `formal-top-${i}`,
          hex: '#808080',
          category: 'top',
          isNeutral: true,
          formality: 'formal',
        }),
      )
      wardrobe.push(
        item({
          id: `formal-bottom-${i}`,
          hex: '#808080',
          category: 'bottom',
          isNeutral: true,
          formality: 'formal',
        }),
      )
    }
    // Only valid casual outfit, appended last.
    wardrobe.push(
      item({
        id: 'late-top',
        hex: '#4D648F',
        category: 'top',
        isNeutral: false,
        formality: 'casual',
        label: 'late-top',
      }),
    )
    wardrobe.push(
      item({
        id: 'late-bottom',
        hex: '#808080',
        category: 'bottom',
        isNeutral: true,
        formality: 'casual',
        label: 'late-bottom',
      }),
    )
    wardrobe.push(
      item({
        id: 'late-shoes',
        hex: '#808080',
        category: 'shoes',
        isNeutral: true,
        formality: 'casual',
        label: 'late-shoes',
      }),
    )

    expect(rawCombinationCount(wardrobe, 2)).toBeGreaterThan(0)
    const outfits = generateOutfits(wardrobe, palette, 'casual')
    expect(outfits.length).toBeGreaterThan(0)
    expect(outfits.some((look) => look.top.id === 'late-top')).toBe(true)
  })

  it('returns identical best outfits regardless of wardrobe array order', () => {
    const base = [
      item({ id: 't1', hex: '#4D648F', category: 'top', isNeutral: false }),
      item({ id: 't2', hex: '#e74c3c', category: 'top', isNeutral: false }),
      item({ id: 'b1', hex: '#808080', category: 'bottom', isNeutral: true }),
      item({ id: 'b2', hex: '#808080', category: 'bottom', isNeutral: true }),
      item({ id: 's1', hex: '#808080', category: 'shoes', isNeutral: true }),
      item({ id: 's2', hex: '#808080', category: 'shoes', isNeutral: true }),
      item({ id: 'a1', hex: '#808080', category: 'accessory', isNeutral: true }),
    ]
    const reversed = [...base].reverse()
    const a = generateOutfits(base, palette)
    const b = generateOutfits(reversed, palette)
    expect(a.map((o) => `${o.colorScheme}:${o.top.id}:${o.bottom.id}:${o.shoes.id}:${o.score}`)).toEqual(
      b.map((o) => `${o.colorScheme}:${o.top.id}:${o.bottom.id}:${o.shoes.id}:${o.score}`),
    )
  })

  it('matches unpruned best result on a small closet', () => {
    const wardrobe = [
      item({ id: 't1', hex: '#4D648F', category: 'top', isNeutral: false }),
      item({ id: 'b1', hex: '#808080', category: 'bottom', isNeutral: true }),
      item({ id: 's1', hex: '#808080', category: 'shoes', isNeutral: true }),
      item({ id: 'a1', hex: '#808080', category: 'accessory', isNeutral: true }),
    ]
    const limits = planEnumerationLimits(wardrobe, 'any')
    expect(limits.estimated).toBeLessThanOrEqual(MAX_COMBINATIONS)
    expect(limits.maxAccessories).toBe(2)
    expect(limits.topK).toBeNull()
    const outfits = generateOutfits(wardrobe, palette)
    expect(outfits.length).toBeGreaterThan(0)
    expect(outfits[0].top.id).toBe('t1')
  })
})
