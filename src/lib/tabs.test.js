import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getStoredTab, persistTab, TAB_STORAGE_KEY } from './tabs.js'

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value))
    },
    removeItem: (key) => {
      map.delete(key)
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getStoredTab', () => {
  it('returns palette when nothing is stored', () => {
    expect(getStoredTab()).toBe('palette')
  })

  it('returns a known tab', () => {
    localStorage.setItem(TAB_STORAGE_KEY, 'wardrobe')
    expect(getStoredTab()).toBe('wardrobe')
  })

  it('falls back to palette for an unknown value', () => {
    localStorage.setItem(TAB_STORAGE_KEY, 'settings')
    expect(getStoredTab()).toBe('palette')
  })

  it('falls back to palette when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(getStoredTab()).toBe('palette')
    expect(() => persistTab('outfit')).not.toThrow()
  })
})

describe('persistTab', () => {
  it('stores wardrobe and outfit', () => {
    persistTab('wardrobe')
    expect(localStorage.getItem(TAB_STORAGE_KEY)).toBe('wardrobe')
    persistTab('outfit')
    expect(getStoredTab()).toBe('outfit')
  })

  it('ignores unknown tabs', () => {
    persistTab('wardrobe')
    persistTab('nope')
    expect(getStoredTab()).toBe('wardrobe')
  })
})
