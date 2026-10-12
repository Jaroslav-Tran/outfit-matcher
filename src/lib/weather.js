import { SEASONS } from './constants.js'

/** Soft score bonus per item tagged for today's temperature band. */
export const WEATHER_ITEM_BONUS = 2

export const TEMP_BANDS = {
  cold: { maxC: 10, seasons: ['winter'], label: 'Cold' },
  mild: { minC: 10, maxC: 22, seasons: ['spring', 'fall'], label: 'Mild' },
  hot: { minC: 22, seasons: ['summer'], label: 'Hot' },
}

export const TEMP_BAND_KEYS = ['cold', 'mild', 'hot']

const CACHE_MS = 30 * 60 * 1000

let weatherCache = null

export function bandFromTempC(tempC) {
  if (!Number.isFinite(tempC)) return null
  if (tempC < 10) return 'cold'
  if (tempC < 22) return 'mild'
  return 'hot'
}

export function seasonsForBand(band) {
  return TEMP_BANDS[band]?.seasons ? [...TEMP_BANDS[band].seasons] : []
}

export function itemMatchesWeatherSeasons(item, weatherSeasons) {
  if (!weatherSeasons?.length) return false
  const seasons = item.seasons?.length ? item.seasons : SEASONS
  return weatherSeasons.some((season) => seasons.includes(season))
}

export function weatherBonusForItem(item, weatherSeasons) {
  return itemMatchesWeatherSeasons(item, weatherSeasons) ? WEATHER_ITEM_BONUS : 0
}

export function comboWeatherBonus(items, weatherSeasons) {
  if (!weatherSeasons?.length) return 0
  return (items || []).reduce(
    (sum, item) => sum + weatherBonusForItem(item, weatherSeasons),
    0,
  )
}

/** Round lat/lon to 1 decimal place before sending to Open-Meteo (PRIV-01). */
export function roundCoord(value) {
  return Math.round(Number(value) * 10) / 10
}

export function openMeteoForecastUrl(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast')
  url.searchParams.set('latitude', String(roundCoord(lat)))
  url.searchParams.set('longitude', String(roundCoord(lon)))
  url.searchParams.set('current', 'temperature_2m')
  return url
}

function readCachedWeather(lat, lon) {
  if (!weatherCache) return null
  if (Date.now() - weatherCache.fetchedAt > CACHE_MS) return null
  if (
    Math.abs(weatherCache.lat - lat) > 0.05 ||
    Math.abs(weatherCache.lon - lon) > 0.05
  ) {
    return null
  }
  return weatherCache
}

export function clearWeatherCache() {
  weatherCache = null
}

export async function fetchOpenMeteoTemp(lat, lon) {
  const roundedLat = roundCoord(lat)
  const roundedLon = roundCoord(lon)
  const cached = readCachedWeather(roundedLat, roundedLon)
  if (cached) return cached

  const url = openMeteoForecastUrl(roundedLat, roundedLon)

  const response = await fetch(url)
  if (!response.ok) throw new Error('Weather request failed')
  const payload = await response.json()
  const tempC = payload?.current?.temperature_2m
  if (!Number.isFinite(tempC)) throw new Error('Weather response missing temperature')

  const band = bandFromTempC(tempC)
  weatherCache = {
    lat: roundedLat,
    lon: roundedLon,
    tempC,
    band,
    seasons: seasonsForBand(band),
    source: 'location',
    fetchedAt: Date.now(),
  }
  return weatherCache
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator?.geolocation) {
      reject(Object.assign(new Error('Geolocation is not supported in this browser'), { code: 0 }))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        })
      },
      (error) => reject(error),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 },
    )
  })
}

export function geolocationErrorMessage(error) {
  const code = error?.code
  if (code === 1) {
    return 'Location permission denied. Allow Location for this browser in System Settings, or use Cold / Mild / Hot.'
  }
  if (code === 2) {
    return 'Location unavailable. Check that Location Services is on, or use Cold / Mild / Hot.'
  }
  if (code === 3) {
    return 'Location timed out. Try again, or use Cold / Mild / Hot.'
  }
  if (code === 0) {
    return 'This browser cannot use location. Use Cold / Mild / Hot.'
  }
  return 'Could not get weather from location. Use Cold / Mild / Hot.'
}

/**
 * Try geolocation + Open-Meteo.
 * Returns { ok: true, weather } or { ok: false, message }.
 */
export async function resolveWeatherFromLocation() {
  try {
    const { lat, lon } = await getCurrentPosition()
    try {
      const weather = await fetchOpenMeteoTemp(lat, lon)
      return { ok: true, weather }
    } catch {
      return {
        ok: false,
        message: 'Got your location, but the weather request failed. Use Cold / Mild / Hot.',
      }
    }
  } catch (error) {
    return { ok: false, message: geolocationErrorMessage(error) }
  }
}

export function weatherFromManualBand(band) {
  if (!TEMP_BANDS[band]) return null
  return {
    tempC: null,
    band,
    seasons: seasonsForBand(band),
    source: 'manual',
    fetchedAt: Date.now(),
  }
}
