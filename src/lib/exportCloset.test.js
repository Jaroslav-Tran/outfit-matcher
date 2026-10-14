import { describe, expect, it } from 'vitest'
import { shapeClosetExport, wardrobeMatchesExportFilters } from './exportCloset.js'

const jeans = {
  id: '1',
  hex: '#735742',
  label: 'Black jeans',
  category: ['bottom'],
  formality: 'casual',
  fit: 'regular',
  warmth: 'medium',
  length: 'regular',
  seasons: ['spring', 'summer', 'fall', 'winter'],
  is_neutral: true,
  image_path: 'user/1.jpg',
  last_worn: null,
  created_at: '2026-10-01T00:00:00.000Z',
}

const coat = {
  ...jeans,
  id: '2',
  label: 'Coat',
  category: ['outerwear'],
  formality: 'formal',
  warmth: null,
  seasons: ['winter'],
}

describe('wardrobeMatchesExportFilters', () => {
  it('keeps every item when no filter is selected', () => {
    expect(wardrobeMatchesExportFilters(jeans, {})).toBe(true)
    expect(wardrobeMatchesExportFilters(coat, {})).toBe(true)
  })

  it('filters by category, formality, season, and warmth', () => {
    expect(wardrobeMatchesExportFilters(jeans, { categories: ['bottom'] })).toBe(true)
    expect(wardrobeMatchesExportFilters(coat, { categories: ['bottom'] })).toBe(false)
    expect(wardrobeMatchesExportFilters(coat, { formalities: ['formal'] })).toBe(true)
    expect(wardrobeMatchesExportFilters(jeans, { seasons: ['winter'] })).toBe(true)
    expect(wardrobeMatchesExportFilters(coat, { seasons: ['summer'] })).toBe(false)
    expect(wardrobeMatchesExportFilters(jeans, { warmths: ['medium'] })).toBe(true)
    expect(wardrobeMatchesExportFilters(coat, { warmths: ['unset'] })).toBe(true)
    expect(wardrobeMatchesExportFilters(jeans, { warmths: ['unset'] })).toBe(false)
  })
})

describe('shapeClosetExport', () => {
  it('keeps only the selected properties and matching clothes', () => {
    const shaped = shapeClosetExport(
      {
        schema_version: 1,
        exported_at: '2026-10-14T00:00:00.000Z',
        palette: [{ id: 'p', hex: '#ffffff', label: 'White' }],
        wardrobe: [jeans, coat],
      },
      {
        fields: ['label', 'hex', 'formality'],
        categories: ['bottom'],
        includePalette: true,
      },
    )
    expect(shaped.schema_version).toBe(1)
    expect(shaped.palette).toHaveLength(1)
    expect(shaped.wardrobe).toEqual([
      { label: 'Black jeans', hex: '#735742', formality: 'casual' },
    ])
    expect(shaped.wardrobe[0].image_path).toBeUndefined()
    expect(JSON.stringify(shaped)).not.toContain('imageUrl')
  })
})
