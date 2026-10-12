import { useEffect, useRef, useState } from 'react'
import BulkUploadSection from './BulkUploadSection.jsx'
import CategoryPills from './CategoryPills.jsx'
import SegmentedControl from './SegmentedControl.jsx'
import SeasonPills from './SeasonPills.jsx'
import Switch from './Switch.jsx'
import {
  extractGarmentColors,
  findClosestPaletteColor,
  isSuggestedNeutral,
  isValidHex,
  suggestClothHex,
  toHex,
} from '../lib/colorUtils.js'
import { fileToResizedImage, revokeIfBlobUrl } from '../lib/imageUtils.js'
import {
  CATEGORIES,
  FORMALITIES,
  FITS,
  LENGTHS,
  SEASONS,
  WARMTHS,
  extraCategories,
  fitLabel,
  homeCategory,
  itemHasCategory,
  normalizeCategories,
  primaryCategory,
} from '../lib/constants.js'
import { SuggestLimitError, suggestTagsFromPhoto } from '../lib/suggestTags.js'
import { release, tryAcquire } from '../lib/submitLock.js'

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

function WardrobeItemCard({ item, open, onToggle, onUpdateItem, onRemoveItem, onImageError }) {
  const home = homeCategory(item)
  const extras = extraCategories(item)
  return (
    <li className={`item-card-wrap${open ? ' is-open' : ''}`}>
      <button
        type="button"
        className="item-card"
        aria-expanded={open}
        onClick={onToggle}
      >
        <div className="item-card-media">
          <img
            src={item.imageUrl}
            alt={item.label || item.category}
            onError={() => onImageError?.(item.id)}
          />
          <div className="item-card-scrim" aria-hidden="true" />
        </div>
        <span className="item-card-chevron" aria-hidden="true">
          {open ? '▾' : '›'}
        </span>
        <div className="item-card-overlay">
          <div className="item-card-tags">
            <span className="frost-pill">
              <span className="swatch-chip small" style={{ background: item.hex }} title={item.hex} />
              {home} · {item.formality}
            </span>
            {extras.map((role) => (
              <span key={role} className="frost-pill role-chip">
                also {role}
              </span>
            ))}
            <span className="frost-pill">{fitLabel(item.fit, item)}</span>
            {(item.seasons || []).slice(0, 2).map((season) => (
              <span key={season} className="frost-pill">
                {season}
              </span>
            ))}
          </div>
          <p className="item-card-title">{item.label || item.hex}</p>
        </div>
      </button>

      <div className="item-card-details">
        <Switch
          checked={item.isNeutral}
          label="Neutral"
          onChange={(checked) => onUpdateItem(item.id, { isNeutral: checked })}
        />
        <SeasonPills
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
          className="danger-outline"
          onClick={() => onRemoveItem(item.id)}
        >
          Delete
        </button>
      </div>
    </li>
  )
}

export default function WardrobeTab({
  wardrobe,
  palette = [],
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  onLoadSample,
  sampleAllowed = false,
  hydrating = false,
  onImageError,
}) {
  const [draft, setDraft] = useState(null)
  const [photoColors, setPhotoColors] = useState([])
  const [hex, setHex] = useState('#808080')
  const [categories, setCategories] = useState(['top'])
  const [formality, setFormality] = useState('casual')
  const [fit, setFit] = useState('regular')
  const [warmth, setWarmth] = useState('')
  const [length, setLength] = useState('')
  const [seasons, setSeasons] = useState([...SEASONS])
  const [isNeutral, setIsNeutral] = useState(true)
  const [label, setLabel] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [openId, setOpenId] = useState(null)
  const suggestSeq = useRef(0)
  const confirmTimer = useRef(null)
  const addLockRef = useRef(false)
  const draftIdRef = useRef(null)

  const pickerValue = isValidHex(hex) ? toHex(hex) : '#808080'

  useEffect(() => {
    if (isValidHex(hex)) {
      setIsNeutral(isSuggestedNeutral(hex))
    }
  }, [hex])

  useEffect(() => {
    return () => {
      revokeIfBlobUrl(draft?.objectUrl)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [draft?.objectUrl])

  async function handleFileChange(event) {
    const file = event.target.files?.[0] || null
    revokeIfBlobUrl(draft?.objectUrl)
    setDraft(null)
    draftIdRef.current = null
    setPhotoColors([])
    setError('')
    if (!file) return

    draftIdRef.current = crypto.randomUUID()
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
          if (tags.category?.length) setCategories(tags.category)
          if (tags.formality) setFormality(tags.formality)
          if (tags.fit) setFit(tags.fit)
          if (tags.warmth) setWarmth(tags.warmth)
          if (tags.length) setLength(tags.length)
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
    if (!tryAcquire(addLockRef)) return
    if (!draft?.blob) {
      setError('Upload a photo of the item.')
      release(addLockRef)
      return
    }
    if (!isValidHex(hex)) {
      setError('Enter a valid hex color for this item.')
      release(addLockRef)
      return
    }
    if (!seasons.length) {
      setError('Tag at least one season this piece works for.')
      release(addLockRef)
      return
    }
    const category = normalizeCategories(categories)
    if (!category.length) {
      setError('Tag at least one category.')
      release(addLockRef)
      return
    }

    if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      await onAddItem(
        {
          id: draftIdRef.current,
          imageUrl: draft.objectUrl,
          hex: toHex(hex),
          category,
          formality,
          fit,
          warmth: warmth || null,
          length: length || null,
          seasons: [...seasons],
          isNeutral,
          label: label.trim() || undefined,
        },
        draft.blob,
      )
      setDraft(null)
      draftIdRef.current = null
      setPhotoColors([])
      setLabel('')
      event.target.reset()
      setConfirming(true)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirming(false), 900)
    } catch (err) {
      setError(err.message || 'Could not save that item.')
    } finally {
      setBusy(false)
      release(addLockRef)
    }
  }

  const visible =
    categoryFilter === 'all'
      ? wardrobe
      : wardrobe.filter((item) => itemHasCategory(item, categoryFilter))

  // DATA-06: each item appears once under its first category; other roles are chips.
  const grouped = CATEGORIES.map((cat) => ({
    category: cat,
    items: visible.filter((item) => homeCategory(item) === cat),
  })).filter((group) => group.items.length > 0)

  const fitCategory = primaryCategory({ category: categories })

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
        {sampleAllowed ? (
          <button
            type="button"
            className="secondary"
            disabled={hydrating}
            onClick={onLoadSample}
          >
            Add sample data
          </button>
        ) : null}
      </div>

      <form className="stack form-card" onSubmit={handleAdd}>
        <label className="field">
          <span>Photo (single)</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={hydrating}
            onChange={handleFileChange}
          />
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
              className="tabular"
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

        <CategoryPills value={categories} onChange={setCategories} />

        <div className="picker-stack">
          <div className="picker-block">
            <span className="picker-label">Formality</span>
            <SegmentedControl
              size="sm"
              ariaLabel="Formality"
              options={FORMALITIES.map((value) => ({ value, label: value }))}
              value={formality}
              onChange={setFormality}
            />
          </div>
          <div className="picker-block">
            <span className="picker-label">{fitCategory === 'shoes' ? 'Fit (footwear)' : 'Fit'}</span>
            <SegmentedControl
              size="sm"
              ariaLabel="Fit"
              options={FITS.map((value) => ({
                value,
                label: fitLabel(value, fitCategory),
              }))}
              value={fit}
              onChange={setFit}
            />
          </div>
          <div className="color-row">
            <label className="field grow">
              <span>Warmth</span>
              <select
                className="select-native"
                value={warmth}
                onChange={(event) => setWarmth(event.target.value)}
              >
                <option value="">Not set</option>
                {WARMTHS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field grow">
              <span>Length</span>
              <select
                className="select-native"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              >
                <option value="">Not set</option>
                {LENGTHS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Switch checked={isNeutral} label="Neutral" onChange={setIsNeutral} />
        </div>
        <p className="hint">
          Formality is your tag unless auto-suggest fills it: casual = everyday,
          smart-casual = polished but not a suit, formal = suit / dress-code.
        </p>

        <SeasonPills value={seasons} onChange={setSeasons} />

        {error ? <p className="error">{error}</p> : null}
        <button
          type="submit"
          className={confirming ? 'primary is-confirming' : 'primary'}
          disabled={busy || suggesting || hydrating}
        >
          {hydrating ? 'Loading…' : busy ? 'Saving…' : confirming ? 'Added ✓' : 'Add item'}
        </button>
      </form>

      <BulkUploadSection
        wardrobe={wardrobe}
        palette={palette}
        onAddItem={onAddItem}
        disabled={hydrating}
      />

      <div className="toolbar">
        <label className="field inline">
          <span>Filter</span>
          <select
            className="select-native"
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
        <p className="empty">No clothing items yet — add one above or add sample data.</p>
      ) : grouped.length === 0 ? (
        <p className="empty">No items in this category.</p>
      ) : (
        grouped.map((group) => (
          <div key={group.category} className="group">
            <h3>{group.category}</h3>
            <ul className="card-grid">
              {group.items.map((item) => (
                <WardrobeItemCard
                  key={item.id}
                  item={item}
                  open={openId === item.id}
                  onToggle={() => setOpenId((current) => (current === item.id ? null : item.id))}
                  onUpdateItem={onUpdateItem}
                  onRemoveItem={onRemoveItem}
                  onImageError={onImageError}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}
