export const TAB_STORAGE_KEY = 'outfit-matcher-tab'

export const TABS = ['palette', 'wardrobe', 'outfit']

export function getStoredTab() {
  try {
    const stored = localStorage.getItem(TAB_STORAGE_KEY)
    return TABS.includes(stored) ? stored : 'palette'
  } catch {
    return 'palette'
  }
}

export function persistTab(tab) {
  if (!TABS.includes(tab)) return
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tab)
  } catch {
    // localStorage unavailable — the in-memory tab still works for this visit.
  }
}
