import { describe, expect, it } from 'vitest'
import { extraCategories, homeCategory } from './constants.js'

describe('DATA-06 wardrobe grid home category', () => {
  it('uses the first listed category as home', () => {
    expect(homeCategory({ category: ['top', 'mid-layer'] })).toBe('top')
    expect(homeCategory({ category: ['mid-layer', 'top'] })).toBe('mid-layer')
  })

  it('returns other roles as extra chips', () => {
    expect(extraCategories({ category: ['top', 'mid-layer'] })).toEqual(['mid-layer'])
    expect(extraCategories({ category: ['top'] })).toEqual([])
  })

  it('does not duplicate an item across home categories', () => {
    const items = [
      { id: '1', category: ['top', 'mid-layer'] },
      { id: '2', category: ['bottom'] },
    ]
    const tops = items.filter((item) => homeCategory(item) === 'top')
    const mids = items.filter((item) => homeCategory(item) === 'mid-layer')
    expect(tops.map((i) => i.id)).toEqual(['1'])
    expect(mids.map((i) => i.id)).toEqual([])
  })
})
