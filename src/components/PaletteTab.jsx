import { useEffect, useState } from 'react'
import {
  extractPaletteFromImageData,
  hueFamilyName,
  isNearExistingColor,
  isValidHex,
  toHex,
} from '../lib/colorUtils.js'
import { fileToResizedImage, revokeIfBlobUrl } from '../lib/imageUtils.js'

export default function PaletteTab({
  palette,
  savedReferenceUrl = '',
  onAddColor,
  onAddColors,
  onRemoveColor,
  onSaveReference,
}) {
  const [hex, setHex] = useState('#c08081')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [localReferenceUrl, setLocalReferenceUrl] = useState('')
  const [extracted, setExtracted] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    return () => revokeIfBlobUrl(localReferenceUrl)
  }, [localReferenceUrl])

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#c08081'
  const referenceUrl = localReferenceUrl || savedReferenceUrl
  const newExtracted = extracted.filter((color) => !isNearExistingColor(color.hex, palette))
  const selectedNew = newExtracted.filter((color) => selected.has(color.hex))

  async function handleReferenceUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    revokeIfBlobUrl(localReferenceUrl)
    setLocalReferenceUrl('')
    setExtracted([])
    setSelected(new Set())
    setError('')
    setExtracting(true)
    try {
      const processed = await fileToResizedImage(file, 1000)
      setLocalReferenceUrl(processed.objectUrl)
      const colors = extractPaletteFromImageData(processed.imageData)
      setExtracted(colors)
      setSelected(new Set(colors.map((color) => color.hex)))
      if (!colors.length) {
        setError('No color swatches found in that screenshot. Add colors by hand below.')
      }
      if (onSaveReference) await onSaveReference(processed.blob)
    } catch (err) {
      setError(err.message || 'Could not read that screenshot.')
    } finally {
      setExtracting(false)
    }
  }

  function toggleExtracted(hexValue) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(hexValue)) next.delete(hexValue)
      else next.add(hexValue)
      return next
    })
  }

  function handleExtractedClick(color) {
    const saved = palette.find((entry) => isNearExistingColor(color.hex, [entry]))
    if (saved) {
      onRemoveColor(saved.id)
      return
    }
    toggleExtracted(color.hex)
  }

  function addExtracted(colors) {
    const toAdd = colors
      .filter((color) => !isNearExistingColor(color.hex, palette))
      .map((color) => ({
        id: crypto.randomUUID(),
        hex: color.hex,
        label: hueFamilyName(color.hex),
      }))
    if (!toAdd.length) {
      setError('Those colors are already in your palette.')
      return
    }
    setError('')
    onAddColors(toAdd)
    setSelected((current) => {
      const added = new Set(toAdd.map((color) => color.hex))
      return new Set([...current].filter((value) => !added.has(value)))
    })
  }

  function handleAdd(event) {
    event.preventDefault()
    if (!isValidHex(hex)) {
      setError('Enter a valid hex color (e.g. #c08081).')
      return
    }
    const normalized = toHex(hex)
    if (isNearExistingColor(normalized, palette)) {
      setError('That color is already in your palette.')
      return
    }
    onAddColor({
      id: crypto.randomUUID(),
      hex: normalized,
      label: label.trim() || undefined,
    })
    setLabel('')
    setError('')
  }

  return (
    <section className="panel">
      <h2>My Palette</h2>
      <p className="lede">
        Upload a color-analysis screenshot to extract swatches, or add colors by
        hand. The screenshot is saved to your account. Use Remove on a saved
        color to delete it.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Color analysis screenshot</span>
          <input type="file" accept="image/*" onChange={handleReferenceUpload} />
        </label>
        {extracting ? <p className="hint">Reading swatches and saving the screenshot…</p> : null}
        {referenceUrl ? (
          <img
            className="reference-preview"
            src={referenceUrl}
            alt="Color analysis reference"
          />
        ) : null}

        {extracted.length ? (
          <div className="extract-block">
            <p className="hint">
              Found {extracted.length} color{extracted.length === 1 ? '' : 's'}.
              Deselect any that are paper, hair, or text, then add the rest. Tap
              a saved swatch to remove it from your palette.
            </p>
            <ul className="extract-grid">
              {extracted.map((color) => {
                const already = isNearExistingColor(color.hex, palette)
                return (
                  <li key={color.hex}>
                    <button
                      type="button"
                      className={`extract-swatch${selected.has(color.hex) ? ' selected' : ''}${already ? ' in-palette' : ''}`}
                      style={{ background: color.hex }}
                      title={already ? 'Remove from palette' : color.hex}
                      onClick={() => handleExtractedClick(color)}
                    />
                    <span className="muted">{already ? 'saved' : color.hex}</span>
                  </li>
                )
              })}
            </ul>
            <div className="color-row">
              <button
                type="button"
                className="secondary"
                disabled={!selectedNew.length}
                onClick={() => addExtracted(selectedNew)}
              >
                Add selected ({selectedNew.length})
              </button>
              <button
                type="button"
                disabled={!newExtracted.length}
                onClick={() => addExtracted(newExtracted)}
              >
                Add all new
              </button>
            </div>
          </div>
        ) : null}

        <form className="stack" onSubmit={handleAdd}>
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
                placeholder="#c08081"
                spellCheck="false"
              />
            </label>
            <label className="field grow">
              <span>Label (optional)</span>
              <input
                type="text"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="coral, sage…"
              />
            </label>
          </div>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit">Add to palette</button>
        </form>
      </div>

      {palette.length === 0 ? (
        <p className="empty">No palette colors yet.</p>
      ) : (
        <ul className="swatch-list">
          {palette.map((color) => (
            <li key={color.id} className="swatch">
              <span className="swatch-chip" style={{ background: color.hex }} />
              <div>
                <strong>{color.label || color.hex}</strong>
                {color.label ? <div className="muted">{color.hex}</div> : null}
              </div>
              <button
                type="button"
                className="remove-btn"
                onClick={() => onRemoveColor(color.id)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
