import { useEffect, useState } from 'react'
import {
  applyTheme,
  getStoredPreference,
  nextPreference,
  persistPreference,
  themeToggleAriaLabel,
} from '../lib/theme.js'

export function useTheme() {
  const [preference, setPreferenceState] = useState(getStoredPreference)

  useEffect(() => {
    applyTheme(preference)
    persistPreference(preference)

    if (preference !== 'system') return undefined

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    function handleChange() {
      applyTheme('system')
    }
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [preference])

  function setPreference(next) {
    setPreferenceState(next)
  }

  function cyclePreference() {
    setPreferenceState((current) => nextPreference(current))
  }

  return {
    preference,
    setPreference,
    cyclePreference,
    ariaLabel: themeToggleAriaLabel(preference),
  }
}
