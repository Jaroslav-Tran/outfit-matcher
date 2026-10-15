import { useEffect, useRef, useState } from 'react'
import CategoryPills from './CategoryPills.jsx'
import Dialog from './Dialog.jsx'
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
import { deleteBulkDraft, listBulkDrafts, upsertBulkDraft } from '../lib/bulkDraftStore.js'
import { SuggestLimitError, suggestTagsFromPhoto } from '../lib/suggestTags.js'
import {
  BULK_STATES,
  BULK_SUGGEST_CONCURRENCY,
  MAX_BULK_UPLOAD_COUNT,
  applyBulkTransition,
  bulkCapDetail,
  bulkCapNotice,
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
  return item.state
}

export default function BulkUploadSection({
  wardrobe,
  palette = [],
  userId = null,
  onAddItem,
  disabled = false,
}) {
  const [items, setItems] = useState([])
  const [capMessage, setCapMessage] = useState('')
  const [capDetail, setCapDetail] = useState(null)
  const [capDialogOpen, setCapDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [quotaBanner, setQuotaBanner] = useState('')
  const [savingAll, setSavingAll] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [confirmingSave, setConfirmingSave] = useState(null)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const confirmTimer = useRef(null)
  const suggestLimitRef = useRef(null)
  const saveAllLockRef = useRef(false)
  const savingIdsRef = useRef(new Set())
  const pickedRef = useRef(false)
  const startProcessingRef = useRef(null)

  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => revokeIfBlobUrl(item.previewUrl))
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    listBulkDrafts(userId)
      .then((drafts) => {
        if (cancelled || pickedRef.current || !drafts.length) return
        const restored = drafts.map((item) => ({
          ...item,
          previewUrl: URL.createObjectURL(item.blob || item.file),
        }))
        setItems(restored)
        const queued = restored.filter((item) => item.state === BULK_STATES.queued)
        if (queued.length) startProcessingRef.current?.(queued)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  function persistDraft(item) {
    if (!userId || !item) return
    const task =
      item.state === BULK_STATES.saved ? deleteBulkDraft(item.id) : upsertBulkDraft(userId, item)
    task.catch(() => {})
  }

  function updateItem(id, updater) {
    setItems((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        const next = typeof updater === 'function' ? updater(item) : { ...item, ...updater }
        persistDraft(next)
        return next
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

      if (!itemsRef.current.some((entry) => entry.id === item.id)) {
        revokeIfBlobUrl(processed.objectUrl)
        return
      }

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
          previewUrl: processed.objectUrl,
        }),
      )
      if (item.previewUrl && item.previewUrl !== processed.objectUrl) {
        revokeIfBlobUrl(item.previewUrl)
      }
    } catch (error) {
      updateItem(item.id, (current) =>
        applyBulkTransition(current, 'fail', {
          error: error.message || 'Could not process this file.',
        }),
      )
    }
  }

  function getSuggestLimit() {
    if (!suggestLimitRef.current) {
      suggestLimitRef.current = createConcurrencyLimiter(BULK_SUGGEST_CONCURRENCY)
    }
    return suggestLimitRef.current
  }

  async function startProcessing(pending) {
    const quotaRef = { hit: false }
    await Promise.all(pending.map((item) => processOne(item, getSuggestLimit(), quotaRef)))
  }
  startProcessingRef.current = startProcessing

  function handleFilesSelected(event) {
    if (disabled) {
      event.target.value = ''
      return
    }
    const selected = event.target.files
    if (!selected?.length) return
    const waiting = itemsRef.current.filter((item) => item.state !== BULK_STATES.saved).length
    const openSlots = Math.max(0, MAX_BULK_UPLOAD_COUNT - waiting)
    const { files, dropped, omitted } = capBatchSize(selected, openSlots)
    const notice = bulkCapNotice(waiting + files.length, dropped)
    const detail = bulkCapDetail({
      added: files.length,
      alreadyWaiting: waiting,
      omittedNames: (omitted || []).map((file) => file?.name),
    })
    setCapMessage(notice)
    setCapDetail(detail)
    setCapDialogOpen(Boolean(detail))
    setQuotaBanner('')
    setBatchError('')

    pickedRef.current = true
    const pending = files.map((file) => createPendingBulkItem(file))
    setItems((current) => [...current, ...pending])
    event.target.value = ''
    if (userId && pending.length) {
      Promise.all(pending.map((item) => upsertBulkDraft(userId, item))).catch(() => {})
    }
    if (pending.length) startProcessing(pending)
  }

  function removeFromQueue(item) {
    if (!item || item.state === BULK_STATES.saved) return
    if (savingIdsRef.current.has(item.id)) return
    revokeIfBlobUrl(item.previewUrl)
    setItems((current) => current.filter((entry) => entry.id !== item.id))
    if (userId) deleteBulkDraft(item.id).catch(() => {})
    setEditingId((current) => (current === item.id ? null : current))
  }

  async function saveOne(item) {
    if (item.state !== BULK_STATES.ready || !item.blob) return
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
      if (userId) deleteBulkDraft(item.id).catch(() => {})
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
      const ready = itemsRef.current.filter((item) => item.state === BULK_STATES.ready)
      for (const item of ready) {
        const latest = itemsRef.current.find((entry) => entry.id === item.id)
        if (!latest || latest.state !== BULK_STATES.ready) continue
        await saveOne(latest)
      }
    } finally {
      setSavingAll(false)
      release(saveAllLockRef)
    }
  }

  function retryOne(item) {
    if (item.state !== BULK_STATES.failed) return
    const quotaRef = { hit: Boolean(quotaBanner) }
    processOne(item, getSuggestLimit(), quotaRef)
  }

  const readyCount = items.filter((item) => item.state === BULK_STATES.ready).length
  const editingItem = items.find((item) => item.id === editingId) || null

  return (
    <div className="form-card bulk-upload">
      <div className="panel-header">
        <div>
          <h3>Bulk upload</h3>
          <p className="lede">
            Select up to {MAX_BULK_UPLOAD_COUNT} photos. Each row is a short
            preview. Open a row to edit every tag. Unsaved rows stay in this
            browser after a reload, and a new pick is added to the queue until
            it is full.
          </p>
        </div>
      </div>

      <label className="field">
        <span>Photos (multiple)</span>
        <input
          type="file"
          accept="image/*,.heic,.heif,image/heic,image/heif"
          multiple
          disabled={disabled}
          onChange={handleFilesSelected}
        />
      </label>

      {capMessage ? (
        <button type="button" className="bulk-cap-message" onClick={() => setCapDialogOpen(true)}>
          {capMessage}
        </button>
      ) : null}
      {quotaBanner ? <p className="error banner">{quotaBanner}</p> : null}
      {batchError ? <p className="error">{batchError}</p> : null}

      {items.length ? (
        <>
          <ul className="bulk-scan">
            {items.map((item) => {
              const categories = normalizeCategories(item.category).join(', ')
              return (
                <li
                  key={item.id}
                  className={`bulk-scan-row${item.state === BULK_STATES.saved ? ' is-saved' : ''}`}
                >
                  <button
                    type="button"
                    className="bulk-scan-main"
                    onClick={() => setEditingId(item.id)}
                  >
                    {(item.previewUrl &&
                    (item.state === BULK_STATES.ready || item.state === BULK_STATES.saved)) ? (
                      <img src={item.previewUrl} alt={item.label || item.file?.name || 'Garment'} />
                    ) : (
                      <span className="bulk-scan-photo" />
                    )}
                    <span className="swatch-chip" style={{ background: item.hex }} title={item.hex} />
                    <span className="tabular bulk-scan-hex">{item.hex}</span>
                    <span className="bulk-scan-label">{item.label || 'Untitled'}</span>
                    <span className="bulk-scan-meta">{categories || '—'}</span>
                    <span className="bulk-scan-meta">{item.formality}</span>
                  </button>
                  <div className="bulk-scan-actions">
                    <span className={`badge bulk-state bulk-state-${stateBadge(item)}`}>
                      {stateBadge(item)}
                    </span>
                    {item.state === BULK_STATES.failed ? (
                      <button type="button" className="secondary" onClick={() => retryOne(item)}>
                        Retry
                      </button>
                    ) : null}
                    {item.state !== BULK_STATES.saved ? (
                      <button type="button" className="danger" onClick={() => removeFromQueue(item)}>
                        Remove
                      </button>
                    ) : null}
                    {item.state === BULK_STATES.ready ? (
                      <button
                        type="button"
                        className={confirmingSave === item.id ? 'primary is-confirming' : 'primary'}
                        onClick={() => saveOne(item)}
                      >
                        {confirmingSave === item.id ? 'Saved ✓' : 'Save'}
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          <p className="bulk-scan-key">
            <span>Picture</span>
            <span>Color swatch</span>
            <span className="bulk-scan-key-wide">Hex code</span>
            <span>Item Name</span>
            <span className="bulk-scan-key-wide">Category</span>
            <span className="bulk-scan-key-wide">Formality</span>
          </p>

          <div className="bulk-actions">
            <button
              type="button"
              className="primary"
              disabled={disabled || savingAll || readyCount === 0}
              onClick={saveAllReady}
            >
              {savingAll ? 'Saving…' : `Save all remaining ready items (${readyCount})`}
            </button>
          </div>
        </>
      ) : null}

      {capDialogOpen && capDetail ? (
        <Dialog title="Bulk upload limit" onClose={() => setCapDialogOpen(false)}>
          <p>{capDetail.lead}</p>
          <ul className="bulk-cap-names">
            {capDetail.names.map((name, index) => (
              <li key={`${name}-${index}`} title={name}>
                {name}
              </li>
            ))}
          </ul>
          <button type="button" className="primary" onClick={() => setCapDialogOpen(false)}>
            OK
          </button>
        </Dialog>
      ) : null}

      {editingItem ? (
        <BulkEditDialog
          item={editingItem}
          items={items}
          duplicatePeers={duplicatePeers}
          confirmingSave={confirmingSave}
          onClose={() => setEditingId(null)}
          onUpdate={updateItem}
          onRemove={removeFromQueue}
          onSave={saveOne}
          onRetry={retryOne}
        />
      ) : null}
    </div>
  )
}

function BulkEditDialog({
  item,
  items,
  duplicatePeers,
  confirmingSave,
  onClose,
  onUpdate,
  onRemove,
  onSave,
  onRetry,
}) {
  const pickerValue = isValidHex(item.hex) ? toHex(item.hex) : '#808080'
  const editable = item.state === BULK_STATES.ready
  const duplicate =
    item.state === BULK_STATES.ready || item.state === BULK_STATES.saved
      ? findDuplicateMatch(
          { hex: item.hex, category: item.category, label: item.label },
          duplicatePeers(items, item),
        )
      : null

  return (
    <Dialog title={item.label || item.file?.name || 'Edit photo'} onClose={onClose}>
      {(item.previewUrl &&
      (item.state === BULK_STATES.ready || item.state === BULK_STATES.saved)) ? (
        <img className="dialog-photo" src={item.previewUrl} alt={item.label || 'Garment'} />
      ) : null}
      {item.state === BULK_STATES.processing || item.state === BULK_STATES.queued ? (
        <p className="hint">{item.state === BULK_STATES.queued ? 'Queued…' : 'Processing…'}</p>
      ) : null}
      {item.state === BULK_STATES.failed ? (
        <div className="stack">
          <p className="error">{item.error || 'Failed'}</p>
          <button type="button" className="secondary" onClick={() => onRetry(item)}>
            Retry
          </button>
        </div>
      ) : null}
      {item.state === BULK_STATES.ready || item.state === BULK_STATES.saved ? (
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
                      onUpdate(item.id, (current) =>
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
                  onUpdate(item.id, (current) =>
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
                  onUpdate(item.id, (current) => patchBulkItem(current, { hex: event.target.value }))
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
                onUpdate(item.id, (current) => patchBulkItem(current, { label: event.target.value }))
              }
            />
          </label>
          <CategoryPills
            value={item.category}
            disabled={!editable}
            onChange={(next) => {
              if (!editable) return
              onUpdate(item.id, (current) => patchBulkItem(current, { category: next }))
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
                  onUpdate(item.id, (current) => patchBulkItem(current, { formality: value }))
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
                options={FITS.map((value) => ({ value, label: fitLabel(value, item) }))}
                value={item.fit}
                onChange={(value) => {
                  onUpdate(item.id, (current) => patchBulkItem(current, { fit: value }))
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
                    onUpdate(item.id, (current) =>
                      patchBulkItem(current, { warmth: event.target.value || null }),
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
                    onUpdate(item.id, (current) =>
                      patchBulkItem(current, { length: event.target.value || null }),
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
              onUpdate(item.id, (current) => patchBulkItem(current, { isNeutral: checked }))
            }
          />
          <SeasonPills
            value={item.seasons}
            disabled={!editable}
            onChange={(next) => {
              if (!editable) return
              onUpdate(item.id, (current) => patchBulkItem(current, { seasons: next }))
            }}
          />
          {duplicate ? (
            <p className="hint">
              Looks similar to &apos;{duplicateNoteLabel(duplicate)}&apos; — add anyway?
            </p>
          ) : null}
          {item.error ? <p className="error">{item.error}</p> : null}
          {item.state === BULK_STATES.saved ? (
            <p className="hint">Saved to wardrobe.</p>
          ) : (
            <div className="bulk-edit-actions">
              <button type="button" className="danger" onClick={() => onRemove(item)}>
                Remove
              </button>
              {item.state === BULK_STATES.ready ? (
                <button
                  type="button"
                  className={confirmingSave === item.id ? 'primary is-confirming' : 'primary'}
                  onClick={() => onSave(item)}
                >
                  {confirmingSave === item.id ? 'Saved ✓' : 'Save'}
                </button>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}
