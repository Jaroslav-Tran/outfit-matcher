import { describe, expect, it } from 'vitest'
import {
  canOfferSampleData,
  filterNewSampleWardrobe,
  wardrobeItemDedupeKey,
} from './sampleAppend.js'

describe('filterNewSampleWardrobe', () => {
  const sample = [
    {
      id: 'a',
      label: 'Dusty Rose blouse',
      hex: '#C497A6',
      category: ['top'],
    },
    {
      id: 'b',
      label: 'Warm Navy jeans',
      hex: '#4D648F',
      category: ['bottom'],
    },
  ]

  it('returns all sample items when wardrobe is empty', () => {
    expect(filterNewSampleWardrobe([], sample)).toHaveLength(2)
  })

  it('second append with the same labels/hex/category adds zero rows', () => {
    const existing = sample.map((item) => ({ ...item, id: crypto.randomUUID() }))
    expect(filterNewSampleWardrobe(existing, sample)).toEqual([])
  })

  it('matches case-insensitively on label and hex', () => {
    const existing = [
      {
        label: 'dusty rose blouse',
        hex: '#c497a6',
        category: ['top'],
      },
    ]
    expect(filterNewSampleWardrobe(existing, sample)).toHaveLength(1)
    expect(filterNewSampleWardrobe(existing, sample)[0].label).toBe('Warm Navy jeans')
  })
})

describe('canOfferSampleData', () => {
  it('allows when wardrobe is empty', () => {
    expect(canOfferSampleData([])).toBe(true)
  })

  it('blocks when wardrobe has items unless DEV', () => {
    expect(canOfferSampleData([{ id: '1' }])).toBe(false)
    expect(canOfferSampleData([{ id: '1' }], true)).toBe(true)
  })
})

describe('wardrobeItemDedupeKey', () => {
  it('is stable for category order', () => {
    expect(
      wardrobeItemDedupeKey({ label: 'x', hex: '#ffffff', category: ['mid-layer', 'top'] }),
    ).toBe(wardrobeItemDedupeKey({ label: 'x', hex: '#ffffff', category: ['top', 'mid-layer'] }))
  })
})