import { describe, expect, it } from 'vitest'
import { extractJsonObject, sanitizeGarmentTags } from './sanitizeTags.js'

describe('sanitizeGarmentTags', () => {
  it('discards injected extra keys', () => {
    const out = sanitizeGarmentTags({
      category: ['top'],
      formality: 'casual',
      fit: 'regular',
      evil: true,
      tool_call: { name: 'hack' },
    })
    expect(out).toEqual({
      category: ['top'],
      formality: 'casual',
      fit: 'regular',
    })
    expect(out).not.toHaveProperty('evil')
    expect(out).not.toHaveProperty('tool_call')
  })

  it('truncates a 5000-character label to 60', () => {
    const out = sanitizeGarmentTags({
      category: ['top'],
      label: 'x'.repeat(5000),
    })
    expect(out.label).toHaveLength(60)
  })

  it('drops invalid category values like scarf', () => {
    const out = sanitizeGarmentTags({ category: ['scarf', 'top'] })
    expect(out.category).toEqual(['top'])
  })

  it('strips markup and control characters from label', () => {
    const out = sanitizeGarmentTags({
      category: ['top'],
      label: '  <script>alert(1)</script>\nblue shirt  ',
    })
    expect(out.label).toBe('scriptalert(1)/scriptblue shirt')
  })

  it('returns empty object for non-JSON / null parse', () => {
    expect(extractJsonObject('not json at all')).toBeNull()
    expect(sanitizeGarmentTags(null)).toEqual({})
  })
})

describe('extractJsonObject', () => {
  it('parses a fenced JSON object from prose', () => {
    expect(extractJsonObject('Here: {"category":["top"],"formality":"casual"} ok')).toEqual({
      category: ['top'],
      formality: 'casual',
    })
  })
})
