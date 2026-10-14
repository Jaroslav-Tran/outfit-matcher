import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getStoredPreference,
  resolveTheme,
  STORAGE_KEY,
} from './theme.js'

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
  vi.stubGlobal('window', {
    matchMedia: () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getStoredPreference', () => {
  it('returns system when nothing is stored', () => {
    expect(getStoredPreference()).toBe('system')
  })

  it('returns dark when dark is stored', () => {
    localStorage.setItem(STORAGE_KEY, 'dark')
    expect(getStoredPreference()).toBe('dark')
  })

  it('returns system for an invalid stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'blue')
    expect(getStoredPreference()).toBe('system')
  })

  it('returns system when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {},
      removeItem: () => {},
    })
    expect(getStoredPreference()).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('resolves system to dark when matchMedia matches', () => {
    window.matchMedia = (query) => ({
      matches: String(query).includes('prefers-color-scheme: dark'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    expect(resolveTheme('system')).toBe('dark')
  })

  it('resolves system to light when matchMedia does not match', () => {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    expect(resolveTheme('system')).toBe('light')
  })

  it('returns light regardless of system preference', () => {
    window.matchMedia = () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
    expect(resolveTheme('light')).toBe('light')
  })
})
