import { BULK_STATES } from './bulkUpload.js'

const DB_NAME = 'outfit-matcher-bulk'
const STORE = 'drafts'

let dbPromise = null

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is unavailable'))
        return
      }
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' })
          store.createIndex('userId', 'userId', { unique: false })
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => {
        dbPromise = null
        reject(request.error)
      }
    })
  }
  return dbPromise
}

export function bulkItemToRecord(userId, item) {
  const blob = item?.blob || item?.file || null
  return {
    id: item.id,
    userId,
    fileName: item.file?.name || 'photo.jpg',
    blob,
    state: item.state === BULK_STATES.processing ? BULK_STATES.queued : item.state,
    excluded: Boolean(item.excluded),
    hex: item.hex,
    category: item.category,
    formality: item.formality,
    fit: item.fit,
    warmth: item.warmth || null,
    length: item.length || null,
    seasons: item.seasons || [],
    isNeutral: Boolean(item.isNeutral),
    label: item.label || '',
    error: item.error || null,
  }
}

export function recordToBulkItem(record) {
  const blob = record.blob
  const file =
    blob instanceof File
      ? blob
      : new File([blob], record.fileName || 'photo.jpg', {
          type: blob?.type || 'image/jpeg',
        })
  const state =
    record.state === BULK_STATES.processing ? BULK_STATES.queued : record.state || BULK_STATES.queued
  return {
    id: record.id,
    file,
    previewUrl: '',
    state,
    excluded: Boolean(record.excluded),
    blob: state === BULK_STATES.ready ? blob : null,
    photoColors: [],
    hex: record.hex || '#808080',
    category: record.category || ['top'],
    formality: record.formality || 'casual',
    fit: record.fit || 'regular',
    warmth: record.warmth || null,
    length: record.length || null,
    seasons: record.seasons?.length ? record.seasons : ['spring', 'summer', 'fall', 'winter'],
    isNeutral: Boolean(record.isNeutral),
    label: record.label || '',
    error: record.error || null,
    duplicateOf: null,
  }
}

export async function listBulkDrafts(userId) {
  const db = await openDb()
  const records = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).index('userId').getAll(userId)
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error)
  })
  return records.map(recordToBulkItem)
}

export function replaceBulkDrafts(userId, items) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const store = tx.objectStore(STORE)
        const existing = store.index('userId').getAllKeys(userId)
        existing.onsuccess = () => {
          for (const key of existing.result || []) store.delete(key)
          for (const item of items || []) {
            if (!item || item.state === BULK_STATES.saved) continue
            const record = bulkItemToRecord(userId, item)
            if (record.blob) store.put(record)
          }
        }
        existing.onerror = () => reject(existing.error)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function upsertBulkDraft(userId, item) {
  if (!item?.id) return Promise.resolve()
  if (item.state === BULK_STATES.saved) return deleteBulkDraft(item.id)
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        const record = bulkItemToRecord(userId, item)
        if (record.blob) tx.objectStore(STORE).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

export function deleteBulkDraft(id) {
  if (!id) return Promise.resolve()
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}
