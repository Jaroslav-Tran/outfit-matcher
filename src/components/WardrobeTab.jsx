import { useEffect, useState } from 'react'
import { isSuggestedNeutral, isValidHex, toHex } from '../lib/colorUtils.js'
import { fileToResizedObjectUrl } from '../lib/imageUtils.js'
import { CATEGORIES, FORMALITIES, FITS, SEASONS, fitLabel, toggleSeason } from '../lib/constants.js'

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

export default function WardrobeTab({
  wardrobe,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onLoadSample,
}) {
  const [file, setFile] = useState(null)
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

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#808080'

  useEffect(() => {
    if (isValidHex(hex)) {
      setIsNeutral(isSuggestedNeutral(hex))
    }
  }, [hex])

  async function handleAdd(event) {
    event.preventDefault()
    if (!file) {
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
      const imageUrl = await fileToResizedObjectUrl(file)
      onAddItem({
        id: crypto.randomUUID(),
        imageUrl,
        hex: toHex(hex),
        category,
        formality,
        fit,
        seasons: [...seasons],
        isNeutral,
        label: label.trim() || undefined,
      })
      setFile(null)
      setLabel('')
      event.target.reset()
    } catch (err) {
      setError(err.message || 'Could not process that image.')
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
            Photograph each piece and tag its color, formality, fit, and seasons
            by hand. Neutral is suggested from the hex; formality, fit, and
            season are not inferred from the photo.
          </p>
        </div>
        <button type="button" className="secondary" onClick={onLoadSample}>
          Load sample data
        </button>
      </div>

      <form className="stack form-card" onSubmit={handleAdd}>
        <label className="field">
          <span>Photo</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
        </label>

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
          Formality is your tag, not a guess from the image: casual = everyday,
          smart-casual = polished but not a suit, formal = suit / dress-code.
        </p>

        <SeasonChecks value={seasons} onChange={setSeasons} />

        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add item'}
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
                    <button
                      type="button"
                      className="linkish"
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
