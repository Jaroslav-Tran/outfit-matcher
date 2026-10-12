import { useEffect, useRef, useState } from 'react'
import SegmentedControl from './SegmentedControl.jsx'
import { generateOutfitsAsync, localDateISO } from '../lib/outfitGenerator.js'
import { SCHEME_LABELS } from '../lib/colorUtils.js'
import { FORMALITIES, SEASONS, fitLabel } from '../lib/constants.js'
import {
  resolveWeatherFromLocation,
  TEMP_BANDS,
  TEMP_BAND_KEYS,
  WEATHER_ITEM_BONUS,
  weatherFromManualBand,
} from '../lib/weather.js'

const FORMALITY_OPTIONS = [
  { value: 'any', label: 'any' },
  ...FORMALITIES.map((value) => ({ value, label: value })),
]
const SEASON_OPTIONS = [
  { value: 'any', label: 'any' },
  ...SEASONS.map((value) => ({ value, label: value })),
]

function slotItems(outfit) {
  return [
    outfit.top,
    outfit.bottom,
    outfit.shoes,
    outfit.midLayer,
    outfit.outerwear,
    ...outfit.accessories,
  ].filter(Boolean)
}

function weatherSummary(weather) {
  if (!weather?.band) return ''
  const label = TEMP_BANDS[weather.band]?.label || weather.band
  if (weather.source === 'location' && Number.isFinite(weather.tempC)) {
    return `${Math.round(weather.tempC)}°C · ${label}`
  }
  return `${label} (manual)`
}

export default function OutfitTab({
  wardrobe,
  palette,
  onMarkOutfitWorn,
  hydrating = false,
  onImageError,
}) {
  const [formalityFilter, setFormalityFilter] = useState('any')
  const [seasonFilter, setSeasonFilter] = useState('any')
  const [results, setResults] = useState(null)
  const [markingScheme, setMarkingScheme] = useState('')
  const [markNotice, setMarkNotice] = useState('')
  const [weather, setWeather] = useState(null)
  const [weatherBusy, setWeatherBusy] = useState(false)
  const [weatherHint, setWeatherHint] = useState('')
  const [generating, setGenerating] = useState(false)
  const abortRef = useRef(null)
  const runIdRef = useRef(0)

  useEffect(() => {
    setResults(null)
    setMarkNotice('')
  }, [palette, formalityFilter, seasonFilter, weather])

  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  async function handleUseLocation() {
    setWeatherBusy(true)
    setWeatherHint('')
    const result = await resolveWeatherFromLocation()
    setWeatherBusy(false)
    if (!result.ok) {
      setWeatherHint(result.message)
      return
    }
    setWeather(result.weather)
    setWeatherHint('')
  }

  function handleManualBand(band) {
    setWeather(weatherFromManualBand(band))
    setWeatherHint('')
  }

  async function handleGenerate(event) {
    event.preventDefault()
    if (hydrating) return

    // Second click cancels the in-flight run, then starts a new one.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const runId = ++runIdRef.current

    setMarkNotice('')
    setGenerating(true)
    try {
      const outfits = await generateOutfitsAsync(
        wardrobe,
        palette,
        formalityFilter,
        seasonFilter,
        weather?.seasons || null,
        { signal: controller.signal },
      )
      if (runId !== runIdRef.current || controller.signal.aborted) return
      setResults(outfits)
    } catch (error) {
      if (error?.name === 'AbortError') return
      throw error
    } finally {
      if (runId === runIdRef.current) setGenerating(false)
    }
  }

  async function handleMarkWorn(outfit) {
    if (!onMarkOutfitWorn) return
    setMarkingScheme(outfit.colorScheme)
    setMarkNotice('')
    const iso = localDateISO()
    const ids = slotItems(outfit).map((item) => item.id)
    try {
      await onMarkOutfitWorn(ids)
      setResults((current) =>
        (current || []).map((look) => ({
          ...look,
          top: look.top && ids.includes(look.top.id) ? { ...look.top, lastWorn: iso } : look.top,
          bottom:
            look.bottom && ids.includes(look.bottom.id)
              ? { ...look.bottom, lastWorn: iso }
              : look.bottom,
          shoes:
            look.shoes && ids.includes(look.shoes.id) ? { ...look.shoes, lastWorn: iso } : look.shoes,
          midLayer:
            look.midLayer && ids.includes(look.midLayer.id)
              ? { ...look.midLayer, lastWorn: iso }
              : look.midLayer,
          outerwear:
            look.outerwear && ids.includes(look.outerwear.id)
              ? { ...look.outerwear, lastWorn: iso }
              : look.outerwear,
          accessories: look.accessories.map((item) =>
            ids.includes(item.id) ? { ...item, lastWorn: iso } : item,
          ),
          items: look.items.map((item) =>
            ids.includes(item.id) ? { ...item, lastWorn: iso } : item,
          ),
        })),
      )
      setMarkNotice('Marked as worn today. Generate again to refresh ranking.')
    } catch {
      // App surfaces persistError.
    } finally {
      setMarkingScheme('')
    }
  }

  const manualBand = weather?.source === 'manual' ? weather.band : null

  return (
    <section className="panel">
      <h2>Generate Outfit</h2>
      <p className="lede">
        Builds combinations of top + bottom + shoes, with optional mid-layer and
        outerwear and up to two accessories. Shows one best-scoring look per detected color
        scheme. The formality filter uses the top’s tier; outerwear may be one step more
        formal than the top. Weather (location or Cold / Mild / Hot) softly boosts pieces
        tagged for that temperature band; it does not hide other items.
      </p>

      <div className="weather-bar">
        <div className="weather-actions">
          <button
            type="button"
            className="secondary"
            disabled={weatherBusy || hydrating || generating}
            onClick={handleUseLocation}
          >
            {weatherBusy ? 'Checking weather…' : 'Use my location'}
          </button>
          {TEMP_BAND_KEYS.map((band) => (
            <button
              key={band}
              type="button"
              className={manualBand === band ? 'secondary is-selected' : 'secondary'}
              aria-pressed={manualBand === band}
              disabled={hydrating || generating}
              onClick={() => handleManualBand(band)}
            >
              {TEMP_BANDS[band].label}
            </button>
          ))}
        </div>
        {weather ? (
          <p className="hint">
            Today: {weatherSummary(weather)} · boosting{' '}
            {weather.seasons.join(', ')} tags (+{WEATHER_ITEM_BONUS} per matching piece)
          </p>
        ) : (
          <p className="hint">
            Optional: use location (Open-Meteo) or pick a temperature band.
            Cached ~30 minutes per session.
          </p>
        )}
        {weatherHint ? <p className="error">{weatherHint}</p> : null}
      </div>

      <form className="stack form-card" onSubmit={handleGenerate}>
        <div className="picker-block">
          <span className="picker-label">Formality</span>
          <SegmentedControl
            size="sm"
            ariaLabel="Formality filter"
            options={FORMALITY_OPTIONS}
            value={formalityFilter}
            onChange={setFormalityFilter}
          />
        </div>
        <div className="picker-block">
          <span className="picker-label">Season</span>
          <SegmentedControl
            size="sm"
            ariaLabel="Season filter"
            options={SEASON_OPTIONS}
            value={seasonFilter}
            onChange={setSeasonFilter}
          />
        </div>
        <button type="submit" className="primary" disabled={hydrating}>
          {generating ? 'Generating…' : hydrating ? 'Loading…' : 'Generate'}
        </button>
      </form>

      {markNotice ? <p className="hint">{markNotice}</p> : null}

      {hydrating ? (
        <p className="empty">Loading your wardrobe…</p>
      ) : generating ? (
        <p className="empty">Generating…</p>
      ) : results === null ? (
        <p className="empty">Choose filters and click Generate.</p>
      ) : results.length === 0 ? (
        <p className="empty notice">
          Not enough matching pieces yet — add more items or relax the formality
          or season filter
        </p>
      ) : (
        <ol className="outfit-list">
          {results.map((outfit) => (
            <li key={outfit.colorScheme} className="outfit-card">
              <header>
                <h3>{SCHEME_LABELS[outfit.colorScheme] || outfit.colorScheme}</h3>
                <div className="badges">
                  <span className="badge">{outfit.formality}</span>
                  {seasonFilter !== 'any' ? (
                    <span className="badge">{seasonFilter}</span>
                  ) : null}
                  {weather?.band ? (
                    <span className="badge">{TEMP_BANDS[weather.band].label}</span>
                  ) : null}
                  <span className="badge tabular">score {outfit.score.toFixed(1)}</span>
                </div>
              </header>
              <ul className="outfit-pieces">
                {slotItems(outfit).map((item) => (
                  <li key={item.id}>
                    <img
                      src={item.imageUrl}
                      alt={item.label || item.category}
                      onError={() => onImageError?.(item.id)}
                    />
                    <span className="swatch-chip small" style={{ background: item.hex }} />
                    <span>{item.label || item.category}</span>
                    <span className="muted">{fitLabel(item.fit, item)}</span>
                    {item.lastWorn ? (
                      <span className="muted">worn {item.lastWorn}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="explanation">{outfit.explanation}</p>
              <button
                type="button"
                className="secondary"
                disabled={markingScheme === outfit.colorScheme || generating}
                onClick={() => handleMarkWorn(outfit)}
              >
                {markingScheme === outfit.colorScheme ? 'Saving…' : 'Mark as worn'}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
