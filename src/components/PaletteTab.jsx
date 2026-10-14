import { useEffect, useState } from 'react'
import {
  extractPaletteFromImageData,
  findPaletteColorByHex,
  hueFamilyName,
  isValidHex,
  normalizePaletteHex,
  paletteHasHex,
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
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    return () => revokeIfBlobUrl(localReferenceUrl)
  }, [localReferenceUrl])

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#c08081'
  const referenceUrl = localReferenceUrl || savedReferenceUrl
  const newExtracted = extracted.filter((color) => !paletteHasHex(color.hex, palette))
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
    const saved = findPaletteColorByHex(color.hex, palette)
    if (saved) {
      onRemoveColor(saved.id)
      return
    }
    toggleExtracted(color.hex)
  }

  async function addExtracted(colors) {
    const seen = new Set(
      palette.map((entry) => normalizePaletteHex(entry.hex)).filter(Boolean),
    )
    const toAdd = []
    for (const color of colors) {
      const normalized = normalizePaletteHex(color.hex)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      toAdd.push({
        id: crypto.randomUUID(),
        hex: normalized,
        label: hueFamilyName(normalized),
      })
    }
    if (!toAdd.length) {
      setError('Those colors are already in your palette.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onAddColors(toAdd)
      setSelected((current) => {
        const added = new Set(toAdd.map((color) => color.hex))
        return new Set([...current].filter((value) => !added.has(value)))
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd(event) {
    event.preventDefault()
    if (!isValidHex(hex)) {
      setError('Enter a valid hex color (e.g. #c08081).')
      return
    }
    const normalized = normalizePaletteHex(hex)
    if (!normalized) {
      setError('Enter a valid hex color (e.g. #c08081).')
      return
    }
    if (paletteHasHex(normalized, palette)) {
      setError('That color is already in your palette.')
      return
    }
    setError('')
    setSaving(true)
    try {
      await onAddColor({
        id: crypto.randomUUID(),
        hex: normalized,
        label: label.trim() || undefined,
      })
      setLabel('')
    } finally {
      setSaving(false)
    }
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
          <input
            type="file"
            accept="image/*,.heic,.heif,image/heic,image/heif"
            onChange={handleReferenceUpload}
          />
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
                const already = paletteHasHex(color.hex, palette)
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
                disabled={saving || !selectedNew.length}
                onClick={() => addExtracted(selectedNew)}
              >
                Add selected ({selectedNew.length})
              </button>
              <button
                type="button"
                className="secondary"
                disabled={saving || !newExtracted.length}
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
                className="tabular"
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
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Saving…' : 'Add to palette'}
          </button>
        </form>
      </div>

      {palette.length === 0 ? (
        <p className="empty">No palette colors yet.</p>
      ) : (
        <ul className="swatch-list">
          {palette.map((color) => (
            <li key={color.id} className="swatch">
              <div className="swatch-body">
                <span className="swatch-chip" style={{ background: color.hex }} />
                <div className="swatch-copy">
                  <strong>{color.label || color.hex}</strong>
                  {color.label ? (
                    <div className="muted tabular">{color.hex}</div>
                  ) : null}
                </div>
              </div>
              <div className="swatch-actions">
                <button
                  type="button"
                  className="swatch-remove"
                  onClick={() => onRemoveColor(color.id)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
