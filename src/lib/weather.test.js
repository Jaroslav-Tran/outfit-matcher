import { describe, expect, it } from 'vitest'
import { openMeteoForecastUrl, roundCoord } from './weather.js'

describe('PRIV-01 coordinate rounding', () => {
  it('rounds to one decimal place', () => {
    expect(roundCoord(50.0755)).toBe(50.1)
    expect(roundCoord(14.4378)).toBe(14.4)
    expect(roundCoord(-0.04)).toBe(-0.0)
  })

  it('puts rounded lat/lon in the Open-Meteo request URL', () => {
    const url = openMeteoForecastUrl(50.0755, 14.4378)
    expect(url.searchParams.get('latitude')).toBe('50.1')
    expect(url.searchParams.get('longitude')).toBe('14.4')
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast')
  })
})
