export const STORAGE_KEY = 'outfit-matcher-theme'

const CYCLE = ['system', 'light', 'dark']

export function getStoredPreference() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function resolveTheme(preference) {
  if (preference === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  }
  return preference === 'dark' ? 'dark' : 'light'
}

export function applyTheme(preference) {
  document.documentElement.setAttribute('data-theme', resolveTheme(preference))
}

export function persistPreference(preference) {
  try {
    localStorage.setItem(STORAGE_KEY, preference)
  } catch {
    // localStorage unavailable — fail quietly
  }
}

export function nextPreference(preference) {
  const index = CYCLE.indexOf(preference)
  return CYCLE[(index + 1) % CYCLE.length]
}

/** Aria label describing what the next click will do. */
export function themeToggleAriaLabel(preference) {
  const next = nextPreference(preference)
  if (next === 'light') return 'Switch to light theme'
  if (next === 'dark') return 'Switch to dark theme'
  return 'Switch to system theme'
}
