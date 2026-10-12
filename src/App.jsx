import { useEffect, useRef, useState } from 'react'
import AuthScreen from './components/AuthScreen.jsx'
import PaletteTab from './components/PaletteTab.jsx'
import WardrobeTab from './components/WardrobeTab.jsx'
import OutfitTab from './components/OutfitTab.jsx'
import SegmentedControl from './components/SegmentedControl.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { useTheme } from './hooks/useTheme.js'
import { createSampleData } from './lib/sampleData.js'
import { canOfferSampleData, filterNewSampleWardrobe } from './lib/sampleAppend.js'
import { release, tryAcquire } from './lib/submitLock.js'
import { revokeIfBlobUrl } from './lib/imageUtils.js'
import { supabase, supabaseConfigured } from './lib/supabase.js'
import {
  deletePaletteColor,
  deleteWardrobeItemRow,
  insertPaletteColor,
  insertPaletteColors,
  insertWardrobeItem,
  loadPalette,
  loadPaletteReference,
  loadWardrobe,
  markItemsWorn,
  appendSampleData,
  savePaletteReference,
  signUrl,
  updateWardrobeItemRow,
} from './lib/persistence.js'
import { downloadJson, exportFilename, fetchClosetExport } from './lib/exportCloset.js'
import { localDateISO } from './lib/outfitGenerator.js'
import { dedupePaletteColors, normalizePaletteHex, paletteHasHex } from './lib/colorUtils.js'
import { tryBeginResign, urlsAreStale } from './lib/signedUrlRefresh.js'
import './App.css'

const TAB_OPTIONS = [
  { value: 'palette', label: 'My Palette' },
  { value: 'wardrobe', label: 'My Wardrobe' },
  { value: 'outfit', label: 'Generate' },
]

function App() {
  const [tab, setTab] = useState('palette')
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!supabaseConfigured)
  const [hydrating, setHydrating] = useState(false)
  const [palette, setPalette] = useState([])
  const [paletteReferenceUrl, setPaletteReferenceUrl] = useState('')
  const [wardrobe, setWardrobe] = useState([])
  const [persistError, setPersistError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { preference: themePreference, cyclePreference } = useTheme()
  const menuRef = useRef(null)
  const wardrobeRef = useRef(wardrobe)
  const sampleLockRef = useRef(false)
  const markWornLockRef = useRef(false)
  const wardrobeSignedAtRef = useRef(null)
  const resignAttemptsRef = useRef(new Map())
  wardrobeRef.current = wardrobe

  useEffect(() => {
    return () => {
      wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined
    function handlePointer(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    function handleKey(event) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', handlePointer)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handlePointer)
      document.removeEventListener('keydown', handleKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!supabase) return undefined
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) {
        setUser(data.session?.user ?? null)
        setAuthReady(true)
      }
    })
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setPalette([])
      setPaletteReferenceUrl('')
      setWardrobe([])
      setHydrating(false)
      return undefined
    }

    let cancelled = false
    setHydrating(true)
    setPersistError('')
    Promise.all([loadPalette(user.id), loadWardrobe(user.id), loadPaletteReference(user.id)])
      .then(([nextPalette, nextWardrobe, nextReference]) => {
        if (cancelled) return
        wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
        setPalette(dedupePaletteColors(nextPalette))
        setWardrobe(nextWardrobe)
        setPaletteReferenceUrl(nextReference)
        wardrobeSignedAtRef.current = Date.now()
        resignAttemptsRef.current = new Map()
      })
      .catch((error) => {
        if (!cancelled) {
          setPersistError(
            error.message ||
              'Could not load your wardrobe. Run supabase/schema.sql in the SQL Editor if tables are missing.',
          )
        }
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [user])

  async function addPaletteColor(color) {
    const hex = normalizePaletteHex(color.hex)
    if (!hex) {
      setPersistError('Enter a valid hex color.')
      return
    }

    let added = null
    setPersistError('')
    setPalette((current) => {
      if (paletteHasHex(hex, current)) {
        return current
      }
      added = { ...color, hex }
      return [...current, added]
    })
    if (!added) {
      setPersistError('That color is already in your palette.')
      return
    }

    try {
      await insertPaletteColor(user.id, added)
    } catch (error) {
      setPalette((current) => current.filter((entry) => entry.id !== added.id))
      setPersistError(error.message || 'Could not save that color.')
    }
  }

  async function addPaletteColors(colors) {
    if (!colors?.length) return

    let unique = []
    setPersistError('')
    setPalette((current) => {
      const seen = new Set(
        current.map((entry) => normalizePaletteHex(entry.hex)).filter(Boolean),
      )
      unique = []
      for (const color of colors) {
        const hex = normalizePaletteHex(color.hex)
        if (!hex || seen.has(hex)) continue
        seen.add(hex)
        unique.push({ ...color, hex })
      }
      if (!unique.length) return current
      return [...current, ...unique]
    })

    if (!unique.length) {
      setPersistError('Those colors are already in your palette.')
      return
    }

    try {
      await insertPaletteColors(user.id, unique)
    } catch (error) {
      const ids = new Set(unique.map((color) => color.id))
      setPalette((current) => current.filter((entry) => !ids.has(entry.id)))
      setPersistError(error.message || 'Could not save those colors.')
    }
  }

  async function removePaletteColor(id) {
    const previous = palette
    setPalette((current) => current.filter((color) => color.id !== id))
    setPersistError('')
    try {
      await deletePaletteColor(user.id, id)
    } catch (error) {
      setPalette(previous)
      setPersistError(error.message || 'Could not delete that color.')
    }
  }

  async function savePaletteScreenshot(blob) {
    setPersistError('')
    const url = await savePaletteReference(user.id, blob)
    setPaletteReferenceUrl(url)
    return url
  }

  async function refreshWardrobeItemUrl(itemId) {
    const item = wardrobeRef.current.find((entry) => entry.id === itemId)
    if (!item?.imagePath) return
    if (!tryBeginResign(resignAttemptsRef.current, itemId)) return
    try {
      const nextUrl = await signUrl(item.imagePath)
      setWardrobe((current) =>
        current.map((entry) => (entry.id === itemId ? { ...entry, imageUrl: nextUrl } : entry)),
      )
    } catch (error) {
      console.warn('Could not refresh signed URL for', itemId, error)
    }
  }

  async function refreshStaleWardrobeUrls() {
    if (!urlsAreStale(wardrobeSignedAtRef.current)) return
    const items = wardrobeRef.current.filter((entry) => entry.imagePath)
    if (!items.length) return
    try {
      const refreshed = await Promise.all(
        items.map(async (item) => {
          if (!tryBeginResign(resignAttemptsRef.current, item.id)) return item
          try {
            const imageUrl = await signUrl(item.imagePath)
            return { ...item, imageUrl }
          } catch {
            return item
          }
        }),
      )
      setWardrobe(refreshed)
      wardrobeSignedAtRef.current = Date.now()
    } catch (error) {
      console.warn('Could not refresh stale signed URLs', error)
    }
  }

  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        refreshStaleWardrobeUrls()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  async function addWardrobeItem(item, blob) {
    setPersistError('')
    const saved = await insertWardrobeItem(user.id, item, blob)
    setWardrobe((current) => [...current, saved])
    return saved
  }

  async function removeWardrobeItem(id) {
    const item = wardrobe.find((entry) => entry.id === id)
    if (!item) return
    const previous = wardrobe
    setWardrobe((current) => current.filter((entry) => entry.id !== id))
    setPersistError('')
    try {
      await deleteWardrobeItemRow(user.id, item)
    } catch (error) {
      setWardrobe(previous)
      setPersistError(error.message || 'Could not delete that item.')
    }
  }

  async function updateWardrobeItem(id, patch) {
    const previous = wardrobe
    setWardrobe((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
    setPersistError('')
    try {
      await updateWardrobeItemRow(user.id, id, patch)
    } catch (error) {
      setWardrobe(previous)
      setPersistError(error.message || 'Could not update that item.')
    }
  }

  async function markOutfitWorn(itemIds) {
    if (!tryAcquire(markWornLockRef)) return
    const ids = [...new Set((itemIds || []).filter(Boolean))]
    if (!ids.length) {
      release(markWornLockRef)
      return
    }
    const today = localDateISO()
    const previous = wardrobe
    setWardrobe((current) =>
      current.map((item) => (ids.includes(item.id) ? { ...item, lastWorn: today } : item)),
    )
    setPersistError('')
    try {
      await markItemsWorn(user.id, ids, today)
    } catch (error) {
      setWardrobe(previous)
      setPersistError(error.message || 'Could not mark those items as worn.')
      throw error
    } finally {
      release(markWornLockRef)
    }
  }

  async function loadSampleData() {
    if (!tryAcquire(sampleLockRef)) return
    try {
      if (!canOfferSampleData(wardrobe, import.meta.env.DEV)) {
        setPersistError('Sample data is only available when your wardrobe is empty.')
        return
      }
      const sample = createSampleData()
      const wardrobeToAdd = filterNewSampleWardrobe(wardrobe, sample.wardrobe)
      const paletteNew = (sample.palette || []).filter((color) => {
        const hex = normalizePaletteHex(color.hex)
        return hex && !paletteHasHex(hex, palette)
      }).length
      const totalNew = wardrobeToAdd.length + paletteNew
      const confirmed = window.confirm(
        `Add sample data? This will add up to ${wardrobeToAdd.length} wardrobe item(s) and ${paletteNew} palette color(s) (${totalNew} new row(s) total). Existing items are kept.`,
      )
      if (!confirmed) return
      setPersistError('')
      const result = await appendSampleData(user.id, palette, wardrobe, sample)
      setPalette(result.palette)
      setWardrobe(result.wardrobe)
      setTab('wardrobe')
    } catch (error) {
      setPersistError(error.message || 'Could not save sample data.')
    } finally {
      release(sampleLockRef)
    }
  }

  async function exportCloset() {
    setPersistError('')
    setExporting(true)
    setMenuOpen(false)
    try {
      const payload = await fetchClosetExport(user.id)
      downloadJson(exportFilename(new Date(payload.exported_at)), payload)
    } catch (error) {
      setPersistError(error.message || 'Could not export your closet.')
    } finally {
      setExporting(false)
    }
  }

  async function signOut() {
    setMenuOpen(false)
    wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    setPalette([])
    setPaletteReferenceUrl('')
    setWardrobe([])
    await supabase.auth.signOut()
  }

  if (!supabaseConfigured) {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header-top">
            <div className="app-header-copy">
              <h1>Outfit Matcher</h1>
              <p className="sync-caption">Add your Supabase keys to get started.</p>
            </div>
            <ThemeToggle preference={themePreference} onCycle={cyclePreference} />
          </div>
        </header>
        <section className="panel">
          <p className="lede">
            Copy <code>.env.example</code> to <code>.env.local</code> and add your
            project URL and publishable key, then restart the dev server.
          </p>
        </section>
      </div>
    )
  }

  if (!authReady) {
    return (
      <div className="app">
        <p className="empty">Checking sign-in…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <AuthScreen
        onSignedIn={setUser}
        themePreference={themePreference}
        onCycleTheme={cyclePreference}
      />
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-top">
          <div className="app-header-copy">
            <h1>Outfit Matcher</h1>
            <p className="sync-caption">Same account on laptop and phone.</p>
          </div>
          <div className="header-actions">
            <ThemeToggle preference={themePreference} onCycle={cyclePreference} />
            <div className="account-menu" ref={menuRef}>
              <button
                type="button"
                className="account-menu-trigger"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                onClick={() => setMenuOpen((open) => !open)}
              >
                Account
              </button>
              {menuOpen ? (
                <div className="account-menu-panel" role="menu">
                  <div className="account-menu-email">{user.email}</div>
                  <button type="button" role="menuitem" disabled={exporting} onClick={exportCloset}>
                    {exporting ? 'Exporting…' : 'Export'}
                  </button>
                  <button type="button" role="menuitem" className="danger-text" onClick={signOut}>
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <SegmentedControl
          className="nav-segmented"
          ariaLabel="Main"
          options={TAB_OPTIONS}
          value={tab}
          onChange={setTab}
        />
      </header>

      <p className="hint storage-hint">
        Photos stay in Supabase Storage; export downloads your tags and colors
        only.
      </p>

      {persistError ? <p className="error banner">{persistError}</p> : null}
      {hydrating ? <p className="empty">Loading your wardrobe…</p> : null}

      <div hidden={tab !== 'palette'}>
        <PaletteTab
          palette={palette}
          savedReferenceUrl={paletteReferenceUrl}
          onAddColor={addPaletteColor}
          onAddColors={addPaletteColors}
          onRemoveColor={removePaletteColor}
          onSaveReference={savePaletteScreenshot}
        />
      </div>
      <div hidden={tab !== 'wardrobe'}>
        <WardrobeTab
          wardrobe={wardrobe}
          palette={palette}
          onAddItem={addWardrobeItem}
          onRemoveItem={removeWardrobeItem}
          onUpdateItem={updateWardrobeItem}
          onLoadSample={loadSampleData}
          sampleAllowed={canOfferSampleData(wardrobe, import.meta.env.DEV)}
          hydrating={hydrating}
          onImageError={refreshWardrobeItemUrl}
        />
      </div>
      <div hidden={tab !== 'outfit'}>
        <OutfitTab
          wardrobe={wardrobe}
          palette={palette}
          onMarkOutfitWorn={markOutfitWorn}
          hydrating={hydrating}
          onImageError={refreshWardrobeItemUrl}
        />
      </div>
    </div>
  )
}

export default App
