import { useEffect, useState } from 'react'
import { isValidHex, toHex } from '../lib/colorUtils.js'
import { revokeIfBlobUrl } from '../lib/imageUtils.js'

export default function PaletteTab({ palette, onAddColor, onRemoveColor }) {
  const [hex, setHex] = useState('#c08081')
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [referenceUrl, setReferenceUrl] = useState('')

  useEffect(() => {
    return () => revokeIfBlobUrl(referenceUrl)
  }, [referenceUrl])

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#c08081'

  function handleReferenceUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    revokeIfBlobUrl(referenceUrl)
    setReferenceUrl(URL.createObjectURL(file))
  }

  function handleAdd(event) {
    event.preventDefault()
    if (!isValidHex(hex)) {
      setError('Enter a valid hex color (e.g. #c08081).')
      return
    }
    onAddColor({
      id: crypto.randomUUID(),
      hex: toHex(hex),
      label: label.trim() || undefined,
    })
    setLabel('')
    setError('')
  }

  return (
    <section className="panel">
      <h2>My Palette</h2>
      <p className="lede">
        Add the colors from your personal color analysis by hand. A screenshot is
        only a visual reminder — nothing is extracted from it.
      </p>

      <div className="form-grid">
        <label className="field">
          <span>Reference screenshot (optional)</span>
          <input type="file" accept="image/*" onChange={handleReferenceUpload} />
        </label>
        {referenceUrl ? (
          <img
            className="reference-preview"
            src={referenceUrl}
            alt="Color analysis reference"
          />
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
              <button type="button" className="linkish" onClick={() => onRemoveColor(color.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
