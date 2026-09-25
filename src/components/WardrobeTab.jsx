import { useEffect, useRef, useState } from 'react'
import {
  extractGarmentColors,
  findClosestPaletteColor,
  isSuggestedNeutral,
  isValidHex,
  suggestClothHex,
  toHex,
} from '../lib/colorUtils.js'
import { fileToResizedImage, revokeIfBlobUrl } from '../lib/imageUtils.js'
import { CATEGORIES, FORMALITIES, FITS, SEASONS, fitLabel, toggleSeason } from '../lib/constants.js'
import { SuggestLimitError, suggestTagsFromPhoto } from '../lib/suggestTags.js'

function SeasonChecks({ value, onChange, legend = 'Seasons' }) {
  return (
    <fieldset className="season-picks">
      <legend>{legend}</legend>
      {SEASONS.map((season) => (
        <label key={season} className="checkbox compact">
          <input
            type="checkbox"
            checked={value.includes(season)}
            onChange={() => onChange(toggleSeason(value, season))}
          />
          {season}
        </label>
      ))}
    </fieldset>
  )
}

function ColorSuggestions({ photoColors, palette, hex, onPick }) {
  const primary = photoColors[0]?.hex
  const suggestion = primary ? suggestClothHex(primary, palette) : null
  const paletteMatch = hex ? findClosestPaletteColor(hex, palette) : { closestPaletteMatch: null, deltaE: Infinity }

  return (
    <div className="extract-block">
      <p className="hint">
        {palette.length === 0
          ? 'Dominant colors from the photo. A striped or printed piece is stored as one hero color — tap the stripe you want outfits to use. Add a palette to snap to your color analysis.'
          : suggestion?.source === 'palette'
            ? `Closest analysis color: ${suggestion.match.label || suggestion.match.hex} (ΔE ${suggestion.deltaE.toFixed(1)}). Tap another swatch if this piece should match a different color.`
            : paletteMatch.closestPaletteMatch
              ? `Using the photo color. Closest analysis color is ${paletteMatch.closestPaletteMatch.label || paletteMatch.closestPaletteMatch.hex} (ΔE ${paletteMatch.deltaE.toFixed(1)}).`
              : 'Dominant colors from the photo. Tap the hero color outfits should use.'}
      </p>
      <ul className="extract-grid">
        {photoColors.map((color, index) => (
          <li key={`photo-${color.hex}`}>
            <button
              type="button"
              className={`extract-swatch${toHex(hex) === color.hex ? ' selected' : ''}`}
              style={{ background: color.hex }}
              title={color.hex}
              onClick={() => onPick(color.hex)}
            />
            <span className="muted">{index === 0 ? 'photo' : 'also'}</span>
          </li>
        ))}
        {palette.map((color) => (
          <li key={`palette-${color.id}`}>
            <button
              type="button"
              className={`extract-swatch${toHex(hex) === toHex(color.hex) ? ' selected' : ''}`}
              style={{ background: color.hex }}
              title={color.label || color.hex}
              onClick={() => onPick(color.hex)}
            />
            <span className="muted">{color.label || 'palette'}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function WardrobeTab({
  wardrobe,
  palette = [],
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onLoadSample,
}) {
  const [draft, setDraft] = useState(null)
  const [photoColors, setPhotoColors] = useState([])
  const [hex, setHex] = useState('#808080')
  const [category, setCategory] = useState('top')
  const [formality, setFormality] = useState('casual')
  const [fit, setFit] = useState('regular')
  const [seasons, setSeasons] = useState([...SEASONS])
  const [isNeutral, setIsNeutral] = useState(true)
  const [label, setLabel] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const suggestSeq = useRef(0)

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#808080'

  useEffect(() => {
    if (isValidHex(hex)) {
      setIsNeutral(isSuggestedNeutral(hex))
    }
  }, [hex])

  useEffect(() => {
    return () => revokeIfBlobUrl(draft?.objectUrl)
  }, [draft?.objectUrl])

  async function handleFileChange(event) {
    const file = event.target.files?.[0] || null
    revokeIfBlobUrl(draft?.objectUrl)
    setDraft(null)
    setPhotoColors([])
    setError('')
    if (!file) return

    const seq = ++suggestSeq.current
    setSuggesting(true)
    try {
      const processed = await fileToResizedImage(file)
      if (seq !== suggestSeq.current) {
        revokeIfBlobUrl(processed.objectUrl)
        return
      }
      setDraft({ blob: processed.blob, objectUrl: processed.objectUrl })
      const colors = extractGarmentColors(processed.imageData)
      setPhotoColors(colors)
      if (colors[0]?.hex) {
        const suggestion = suggestClothHex(colors[0].hex, palette)
        if (suggestion.hex) setHex(suggestion.hex)
      }

      try {
        const tags = await suggestTagsFromPhoto(processed.blob)
        if (seq !== suggestSeq.current) return
        if (tags) {
          if (tags.category) setCategory(tags.category)
          if (tags.formality) setFormality(tags.formality)
          if (tags.fit) setFit(tags.fit)
          if (tags.seasons?.length) setSeasons(tags.seasons)
          if (tags.label) setLabel(tags.label)
        }
      } catch (suggestError) {
        if (seq === suggestSeq.current && suggestError instanceof SuggestLimitError) {
          setError(suggestError.message)
        }
      }
    } catch (err) {
      if (seq === suggestSeq.current) {
        setError(err.message || 'Could not process that image.')
      }
    } finally {
      if (seq === suggestSeq.current) setSuggesting(false)
    }
  }

  async function handleAdd(event) {
    event.preventDefault()
    if (!draft?.blob) {
      setError('Upload a photo of the item.')
      return
    }
    if (!isValidHex(hex)) {
      setError('Enter a valid hex color for this item.')
      return
    }
    if (!seasons.length) {
      setError('Tag at least one season this piece works for.')
      return
    }

    setBusy(true)
    setError('')
    try {
      await onAddItem(
        {
          id: crypto.randomUUID(),
          imageUrl: draft.objectUrl,
          hex: toHex(hex),
          category,
          formality,
          fit,
          seasons: [...seasons],
          isNeutral,
          label: label.trim() || undefined,
        },
        draft.blob,
      )
      setDraft(null)
      setPhotoColors([])
      setLabel('')
      event.target.reset()
    } catch (err) {
      setError(err.message || 'Could not save that item.')
    } finally {
      setBusy(false)
    }
  }

  const visible =
    categoryFilter === 'all'
      ? wardrobe
      : wardrobe.filter((item) => item.category === categoryFilter)

  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    items: visible.filter((item) => item.category === cat),
  })).filter((group) => group.items.length > 0)

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>My Wardrobe</h2>
          <p className="lede">
            Photograph each piece. The photo suggests its dominant colors; if
            you have a palette, the closest analysis color is selected when it
            is a close match. Category, formality, fit, seasons, and label can
            be suggested from the photo. Every field stays editable.
          </p>
        </div>
        <button type="button" className="secondary" onClick={onLoadSample}>
          Load sample data
        </button>
      </div>

      <form className="stack form-card" onSubmit={handleAdd}>
        <label className="field">
          <span>Photo</span>
          <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
        </label>
        {draft?.objectUrl ? (
          <img className="photo-preview" src={draft.objectUrl} alt="Selected garment" />
        ) : null}
        {suggesting ? <p className="hint">Suggesting color and tags from the photo…</p> : null}
        {photoColors.length ? (
          <ColorSuggestions
            photoColors={photoColors}
            palette={palette}
            hex={hex}
            onPick={(value) => setHex(value)}
          />
        ) : null}

        <div className="color-row">
          <label className="field">
            <span>Color</span>
            <input
              type="color"
              value={pickerValue}
              onChange={(event) => setHex(event.target.value)}
            />
          </label>
          <label className="field grow">
            <span>Hex</span>
            <input
              type="text"
              value={hex}
              onChange={(event) => setHex(event.target.value)}
              spellCheck="false"
            />
          </label>
          <label className="field grow">
            <span>Label (optional)</span>
            <input
              type="text"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="grey wool sweater"
            />
          </label>
        </div>

        <div className="color-row">
          <label className="field grow">
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>Formality</span>
            <select value={formality} onChange={(event) => setFormality(event.target.value)}>
              {FORMALITIES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field grow">
            <span>{category === 'shoes' ? 'Fit (footwear)' : 'Fit'}</span>
            <select value={fit} onChange={(event) => setFit(event.target.value)}>
              {FITS.map((value) => (
                <option key={value} value={value}>
                  {fitLabel(value, category)}
                </option>
              ))}
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isNeutral}
              onChange={(event) => setIsNeutral(event.target.checked)}
            />
            Neutral
          </label>
        </div>
        <p className="hint">
          Formality is your tag unless auto-suggest fills it: casual = everyday,
          smart-casual = polished but not a suit, formal = suit / dress-code.
        </p>

        <SeasonChecks value={seasons} onChange={setSeasons} />

        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy || suggesting}>
          {busy ? 'Saving…' : 'Add item'}
        </button>
      </form>

      <div className="toolbar">
        <label className="field inline">
          <span>Filter</span>
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="all">all categories</option>
            {CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">
          {wardrobe.length} item{wardrobe.length === 1 ? '' : 's'}
        </span>
      </div>

      {wardrobe.length === 0 ? (
        <p className="empty">No clothing items yet — add one above or load sample data.</p>
      ) : grouped.length === 0 ? (
        <p className="empty">No items in this category.</p>
      ) : (
        grouped.map((group) => (
          <div key={group.category} className="group">
            <h3>{group.category}</h3>
            <ul className="card-grid">
              {group.items.map((item) => (
                <li key={item.id} className="item-card">
                  <img src={item.imageUrl} alt={item.label || item.category} />
                  <div className="item-meta">
                    <span className="swatch-chip small" style={{ background: item.hex }} title={item.hex} />
                    <strong>{item.label || item.hex}</strong>
                    <div className="badges">
                      <span className="badge">{item.category}</span>
                      <span className="badge">{item.formality}</span>
                      <span className="badge">{fitLabel(item.fit, item.category)}</span>
                      {(item.seasons || []).map((season) => (
                        <span key={season} className="badge">
                          {season}
                        </span>
                      ))}
                    </div>
                    <label className="checkbox compact">
                      <input
                        type="checkbox"
                        checked={item.isNeutral}
                        onChange={() =>
                          onUpdateItem(item.id, { isNeutral: !item.isNeutral })
                        }
                      />
                      Neutral
                    </label>
                    <SeasonChecks
                      legend="Good for"
                      value={item.seasons || []}
                      onChange={(next) => onUpdateItem(item.id, { seasons: next })}
                    />
                    {item.lastWorn ? (
                      <p className="hint">
                        Last worn {item.lastWorn}.{' '}
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => onUpdateItem(item.id, { lastWorn: null })}
                        >
                          Clear worn date
                        </button>
                      </p>
                    ) : (
                      <p className="hint">Never marked as worn.</p>
                    )}
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => onRemoveItem(item.id)}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
