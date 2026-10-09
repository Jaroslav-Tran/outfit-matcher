import { useEffect, useRef, useState } from 'react'
import CategoryPills from './CategoryPills.jsx'
import SegmentedControl from './SegmentedControl.jsx'
import SeasonPills from './SeasonPills.jsx'
import Switch from './Switch.jsx'
import {
  extractGarmentColors,
  isSuggestedNeutral,
  isValidHex,
  suggestClothHex,
  toHex,
} from '../lib/colorUtils.js'
import { fileToResizedImage, revokeIfBlobUrl } from '../lib/imageUtils.js'
import {
  FORMALITIES,
  FITS,
  LENGTHS,
  SEASONS,
  WARMTHS,
  fitLabel,
  normalizeCategories,
  primaryCategory,
} from '../lib/constants.js'
import { SuggestLimitError, suggestTagsFromPhoto } from '../lib/suggestTags.js'
import {
  BULK_STATES,
  BULK_SUGGEST_CONCURRENCY,
  MAX_BULK_UPLOAD_COUNT,
  applyBulkTransition,
  capBatchSize,
  createConcurrencyLimiter,
  createPendingBulkItem,
  duplicateNoteLabel,
  findDuplicateMatch,
  isSuggestQuotaError,
  patchBulkItem,
} from '../lib/bulkUpload.js'
import { release, tryAcquire } from '../lib/submitLock.js'

function stateBadge(item) {
  if (item.excluded && item.state !== BULK_STATES.saved) return 'excluded'
  return item.state
}

export default function BulkUploadSection({ wardrobe, palette = [], onAddItem }) {
  const [items, setItems] = useState([])
  const [capMessage, setCapMessage] = useState('')
  const [quotaBanner, setQuotaBanner] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [confirmingSave, setConfirmingSave] = useState(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const batchIdRef = useRef(0)
  const confirmTimer = useRef(null)
  const saveAllLockRef = useRef(false)
  const savingIdsRef = useRef(new Set())

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => revokeIfBlobUrl(item.previewUrl))
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  function updateItem(id, updater) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        return typeof updater === 'function' ? updater(item) : { ...item, ...updater }
      }),
    )
  }

  function duplicatePeers(currentItems, forItem) {
    const index = currentItems.findIndex((entry) => entry.id === forItem.id)
    const earlier = (index >= 0 ? currentItems.slice(0, index) : currentItems).filter(
      (entry) =>
        entry.state === BULK_STATES.ready || entry.state === BULK_STATES.saved,
    )
    return [
      ...wardrobe.map((entry) => ({
        hex: entry.hex,
        category: entry.category,
        label: entry.label,
      })),
      ...earlier.map((entry) => ({
        hex: entry.hex,
        category: entry.category,
        label: entry.label,
      })),
    ]
  }

  async function processOne(item, suggestLimit, quotaRef) {
    updateItem(item.id, (current) => applyBulkTransition(current, 'start'))
    try {
      const processed = await fileToResizedImage(item.file)
      const colors = extractGarmentColors(processed.imageData)
      const snapped = colors[0]?.hex
        ? suggestClothHex(colors[0].hex, palette)
        : { hex: '#808080' }
      const heroHex = snapped.hex || colors[0]?.hex || '#808080'

      let tags = null
      if (!quotaRef.hit) {
        try {
          tags = await suggestLimit(async () => {
            if (quotaRef.hit) return null
            return suggestTagsFromPhoto(processed.blob)
          })
        } catch (error) {
          if (isSuggestQuotaError(error) || error instanceof SuggestLimitError) {
            quotaRef.hit = true
            setQuotaBanner('AI tagging limit reached — remaining items need manual tags.')
          }
          tags = null
        }
      }

      const category = tags?.category?.length ? tags.category : ['top']
      const formality = tags?.formality || 'casual'
      const fit = tags?.fit || 'regular'
      const warmth = tags?.warmth || null
      const length = tags?.length || null
      const seasons = tags?.seasons?.length ? tags.seasons : [...SEASONS]
      const label = tags?.label || ''

      updateItem(item.id, (current) =>
        applyBulkTransition(current, 'ready', {
          blob: processed.blob,
          photoColors: colors,
          hex: heroHex,
          category,
          formality,
          fit,
          warmth,
          length,
          seasons,
          isNeutral: isSuggestedNeutral(heroHex),
          label,
        }),
      )
      if (processed.objectUrl && processed.objectUrl !== item.previewUrl) {
        revokeIfBlobUrl(processed.objectUrl)
      }
    } catch (error) {
      updateItem(item.id, (current) =>
        applyBulkTransition(current, 'fail', {
          error: error.message || 'Could not process this file.',
        }),
      )
    }
  }

  async function startProcessing(pending) {
    const suggestLimit = createConcurrencyLimiter(BULK_SUGGEST_CONCURRENCY)
    const wrappedSuggest = (task) => suggestLimit(task)
    const quotaRef = { hit: false }

    await Promise.all(pending.map((item) => processOne(item, wrappedSuggest, quotaRef)))
  }

  function handleFilesSelected(event) {
    const selected = event.target.files
    if (!selected?.length) return
    const { files, dropped } = capBatchSize(selected, MAX_BULK_UPLOAD_COUNT)
    setCapMessage(
      dropped > 0
        ? `Only the first ${MAX_BULK_UPLOAD_COUNT} photos were queued (${dropped} not included).`
        : '',
    )
    setQuotaBanner('')
    setBatchError('')

    itemsRef.current.forEach((item) => revokeIfBlobUrl(item.previewUrl))
    batchIdRef.current += 1
    const pending = files.map((file) => createPendingBulkItem(file))
    setItems(pending)
    event.target.value = ''
    startProcessing(pending)
  }

  function handleExcludeToggle(item) {
    updateItem(item.id, (current) =>
      applyBulkTransition(current, item.excluded ? 'include' : 'exclude'),
    )
  }

  async function saveOne(item) {
    if (item.state !== BULK_STATES.ready || item.excluded || !item.blob) return
    if (savingIdsRef.current.has(item.id)) return
    savingIdsRef.current.add(item.id)
    if (!isValidHex(item.hex)) {
      updateItem(item.id, { error: 'Enter a valid hex color.' })
      savingIdsRef.current.delete(item.id)
      return
    }
    if (!item.seasons?.length) {
      updateItem(item.id, { error: 'Tag at least one season.' })
      savingIdsRef.current.delete(item.id)
      return
    }
    const category = normalizeCategories(item.category)
    if (!category.length) {
      updateItem(item.id, { error: 'Tag at least one category.' })
      savingIdsRef.current.delete(item.id)
      return
    }
    updateItem(item.id, { error: null })
    try {
      await onAddItem(
        {
          id: item.id,
          imageUrl: item.previewUrl,
          hex: toHex(item.hex),
          category,
          formality: item.formality,
          fit: item.fit,
          warmth: item.warmth || null,
          length: item.length || null,
          seasons: [...item.seasons],
          isNeutral: item.isNeutral,
          label: item.label.trim() || undefined,
        },
        item.blob,
      )
      updateItem(item.id, (current) => applyBulkTransition(current, 'save'))
      setConfirmingSave(item.id)
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      confirmTimer.current = setTimeout(() => setConfirmingSave(null), 900)
    } catch (error) {
      updateItem(item.id, {
        error: error.message || 'Could not save this item.',
      })
    } finally {
      savingIdsRef.current.delete(item.id)
    }
  }

  async function saveAllReady() {
    if (!tryAcquire(saveAllLockRef)) return
    setSavingAll(true)
    setBatchError('')
    try {
      const ready = itemsRef.current.filter(
        (item) => item.state === BULK_STATES.ready && !item.excluded,
      )
      for (const item of ready) {
        const latest = itemsRef.current.find((entry) => entry.id === item.id)
        if (!latest || latest.state !== BULK_STATES.ready || latest.excluded) continue
        await saveOne(latest)
      }
    } finally {
      setSavingAll(false)
      release(saveAllLockRef)
    }
  }

  function retryOne(item) {
    if (item.state !== BULK_STATES.failed) return
    const suggestLimit = createConcurrencyLimiter(BULK_SUGGEST_CONCURRENCY)
    const quotaRef = { hit: Boolean(quotaBanner) }
    processOne(item, (task) => suggestLimit(task), quotaRef)
  }

  const readyCount = items.filter(
    (item) => item.state === BULK_STATES.ready && !item.excluded,
  ).length

  return (
    <div className="form-card bulk-upload">
      <div className="panel-header">
        <div>
          <h3>Bulk upload</h3>
          <p className="lede">
            Select up to {MAX_BULK_UPLOAD_COUNT} photos from your library. Each
            card is editable before save. AI tags are throttled; if the daily
            limit is hit, remaining cards still open for manual tagging.
          </p>
        </div>
      </div>

      <label className="field">
        <span>Photos (multiple)</span>
        <input type="file" accept="image/*" multiple onChange={handleFilesSelected} />
      </label>

      {capMessage ? <p className="hint">{capMessage}</p> : null}
      {quotaBanner ? <p className="error banner">{quotaBanner}</p> : null}
      {batchError ? <p className="error">{batchError}</p> : null}

      {items.length ? (
        <>
          <ul className="bulk-grid">
            {items.map((item) => {
              const pickerValue = isValidHex(item.hex) ? toHex(item.hex) : '#808080'
              const editable = item.state === BULK_STATES.ready && !item.excluded
              const duplicate =
                item.state === BULK_STATES.ready || item.state === BULK_STATES.saved
                  ? findDuplicateMatch(
                      { hex: item.hex, category: item.category, label: item.label },
                      duplicatePeers(items, item),
                    )
                  : null
              return (
                <li
                  key={item.id}
                  className={`bulk-card${item.excluded ? ' is-excluded' : ''}${item.state === BULK_STATES.saved ? ' is-saved' : ''}`}
                >
                  <div className="bulk-card-media">
                    <img src={item.previewUrl} alt={item.file?.name || 'Pending garment'} />
                    <span className={`badge bulk-state bulk-state-${stateBadge(item)}`}>
                      {stateBadge(item)}
                    </span>
                  </div>

                  {item.state === BULK_STATES.processing || item.state === BULK_STATES.queued ? (
                    <p className="hint">
                      {item.state === BULK_STATES.queued ? 'Queued…' : 'Processing…'}
                    </p>
                  ) : null}

                  {item.state === BULK_STATES.failed ? (
                    <div className="stack">
                      <p className="error">{item.error || 'Failed'}</p>
                      <button type="button" className="secondary" onClick={() => retryOne(item)}>
                        Retry
                      </button>
                    </div>
                  ) : null}

                  {(item.state === BULK_STATES.ready || item.state === BULK_STATES.saved) && (
                    <div className="stack bulk-fields">
                      {item.photoColors?.length ? (
                        <ul className="extract-grid">
                          {item.photoColors.map((color, index) => (
                            <li key={`${item.id}-${color.hex}`}>
                              <button
                                type="button"
                                className={`extract-swatch${toHex(item.hex) === color.hex ? ' selected' : ''}`}
                                style={{ background: color.hex }}
                                disabled={!editable}
                                onClick={() =>
                                  updateItem(item.id, (current) =>
                                    patchBulkItem(current, {
                                      hex: color.hex,
                                      isNeutral: isSuggestedNeutral(color.hex),
                                    }),
                                  )
                                }
                              />
                              <span className="muted">{index === 0 ? 'photo' : 'also'}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      <div className="color-row">
                        <label className="field">
                          <span>Color</span>
                          <input
                            type="color"
                            value={pickerValue}
                            disabled={!editable}
                            onChange={(event) =>
                              updateItem(item.id, (current) =>
                                patchBulkItem(current, {
                                  hex: event.target.value,
                                  isNeutral: isSuggestedNeutral(event.target.value),
                                }),
                              )
                            }
                          />
                        </label>
                        <label className="field grow">
                          <span>Hex</span>
                          <input
                            className="tabular"
                            type="text"
                            value={item.hex}
                            disabled={!editable}
                            onChange={(event) =>
                              updateItem(item.id, (current) =>
                                patchBulkItem(current, { hex: event.target.value }),
                              )
                            }
                          />
                        </label>
                      </div>

                      <label className="field">
                        <span>Label</span>
                        <input
                          type="text"
                          value={item.label}
                          disabled={!editable}
                          onChange={(event) =>
                            updateItem(item.id, (current) =>
                              patchBulkItem(current, { label: event.target.value }),
                            )
                          }
                        />
                      </label>

                      <CategoryPills
                        value={item.category}
                        disabled={!editable}
                        onChange={(next) => {
                          if (!editable) return
                          updateItem(item.id, (current) =>
                            patchBulkItem(current, { category: next }),
                          )
                        }}
                      />

                      <div className="picker-stack">
                        <div className="picker-block">
                          <span className="picker-label">Formality</span>
                          <SegmentedControl
                            size="sm"
                            ariaLabel="Formality"
                            disabled={!editable}
                            options={FORMALITIES.map((value) => ({ value, label: value }))}
                            value={item.formality}
                            onChange={(value) => {
                              updateItem(item.id, (current) =>
                                patchBulkItem(current, { formality: value }),
                              )
                            }}
                          />
                        </div>
                        <div className="picker-block">
                          <span className="picker-label">
                            {primaryCategory(item) === 'shoes' ? 'Fit (footwear)' : 'Fit'}
                          </span>
                          <SegmentedControl
                            size="sm"
                            ariaLabel="Fit"
                            disabled={!editable}
                            options={FITS.map((value) => ({
                              value,
                              label: fitLabel(value, item),
                            }))}
                            value={item.fit}
                            onChange={(value) => {
                              updateItem(item.id, (current) =>
                                patchBulkItem(current, { fit: value }),
                              )
                            }}
                          />
                        </div>
                        <div className="color-row">
                          <label className="field grow">
                            <span>Warmth</span>
                            <select
                              className="select-native"
                              disabled={!editable}
                              value={item.warmth || ''}
                              onChange={(event) =>
                                updateItem(item.id, (current) =>
                                  patchBulkItem(current, {
                                    warmth: event.target.value || null,
                                  }),
                                )
                              }
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
                              disabled={!editable}
                              value={item.length || ''}
                              onChange={(event) =>
                                updateItem(item.id, (current) =>
                                  patchBulkItem(current, {
                                    length: event.target.value || null,
                                  }),
                                )
                              }
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
                      </div>

                      <Switch
                        checked={item.isNeutral}
                        label="Neutral"
                        disabled={!editable}
                        onChange={(checked) =>
                          updateItem(item.id, (current) =>
                            patchBulkItem(current, { isNeutral: checked }),
                          )
                        }
                      />

                      <SeasonPills
                        value={item.seasons}
                        disabled={!editable}
                        onChange={(next) => {
                          if (!editable) return
                          updateItem(item.id, (current) =>
                            patchBulkItem(current, { seasons: next }),
                          )
                        }}
                      />

                      {duplicate ? (
                        <p className="hint">
                          Looks similar to &apos;{duplicateNoteLabel(duplicate)}&apos; — add
                          anyway?
                        </p>
                      ) : null}

                      {item.error ? <p className="error">{item.error}</p> : null}

                      {item.state !== BULK_STATES.saved ? (
                        <label className="checkbox compact">
                          <input
                            type="checkbox"
                            checked={item.excluded}
                            onChange={() => handleExcludeToggle(item)}
                          />
                          Exclude from save
                        </label>
                      ) : (
                        <p className="hint">Saved to wardrobe.</p>
                      )}

                      {item.state === BULK_STATES.ready && !item.excluded ? (
                        <button
                          type="button"
                          className={
                            confirmingSave === item.id ? 'primary is-confirming' : 'primary'
                          }
                          onClick={() => saveOne(item)}
                        >
                          {confirmingSave === item.id ? 'Saved ✓' : 'Save'}
                        </button>
                      ) : null}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="bulk-actions">
            <button
              type="button"
              className="primary"
              disabled={savingAll || readyCount === 0}
              onClick={saveAllReady}
            >
              {savingAll
                ? 'Saving…'
                : `Save all remaining ready items (${readyCount})`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  )
}
