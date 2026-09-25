import { useEffect, useRef, useState } from 'react'
import AuthScreen from './components/AuthScreen.jsx'
import PaletteTab from './components/PaletteTab.jsx'
import WardrobeTab from './components/WardrobeTab.jsx'
import OutfitTab from './components/OutfitTab.jsx'
import { createSampleData } from './lib/sampleData.js'
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
  replaceAllData,
  savePaletteReference,
  updateWardrobeItemRow,
} from './lib/persistence.js'
import { downloadJson, exportFilename, fetchClosetExport } from './lib/exportCloset.js'
import { localDateISO } from './lib/outfitGenerator.js'
import './App.css'

const TABS = [
  { id: 'palette', label: 'My Palette' },
  { id: 'wardrobe', label: 'My Wardrobe' },
  { id: 'outfit', label: 'Generate Outfit' },
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
  const wardrobeRef = useRef(wardrobe)
  wardrobeRef.current = wardrobe

  useEffect(() => {
    return () => {
      wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    }
  }, [])

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
        setPalette(nextPalette)
        setWardrobe(nextWardrobe)
        setPaletteReferenceUrl(nextReference)
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
    setPalette((current) => [...current, color])
    setPersistError('')
    try {
      await insertPaletteColor(user.id, color)
    } catch (error) {
      setPalette((current) => current.filter((entry) => entry.id !== color.id))
      setPersistError(error.message || 'Could not save that color.')
    }
  }

  async function addPaletteColors(colors) {
    if (!colors?.length) return
    setPalette((current) => [...current, ...colors])
    setPersistError('')
    try {
      await insertPaletteColors(user.id, colors)
    } catch (error) {
      const ids = new Set(colors.map((color) => color.id))
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
    const ids = [...new Set((itemIds || []).filter(Boolean))]
    if (!ids.length) return
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
    }
  }

  async function loadSampleData() {
    wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    const sample = createSampleData()
    setPersistError('')
    try {
      const saved = await replaceAllData(user.id, sample.palette, sample.wardrobe)
      setPalette(sample.palette)
      setWardrobe(saved)
      setTab('wardrobe')
    } catch (error) {
      setPersistError(error.message || 'Could not save sample data.')
    }
  }

  async function exportCloset() {
    setPersistError('')
    setExporting(true)
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
          <div>
            <p className="eyebrow">Supabase not configured</p>
            <h1>Outfit Matcher</h1>
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
    return <AuthScreen onSignedIn={setUser} />
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Saved to your account · laptop and phone</p>
          <h1>Outfit Matcher</h1>
          <p className="account-bar">
            <span className="muted">{user.email}</span>
            <button type="button" className="secondary" disabled={exporting} onClick={exportCloset}>
              {exporting ? 'Exporting…' : 'Export my closet'}
            </button>
            <button type="button" className="linkish" onClick={signOut}>
              Sign out
            </button>
          </p>
          <p className="hint">
            Photos stay in Supabase Storage; export downloads your tags and colors
            only.
          </p>
        </div>
        <nav className="tabs" aria-label="Main">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={tab === entry.id ? 'tab active' : 'tab'}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
      </header>

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
        />
      </div>
      <div hidden={tab !== 'outfit'}>
        <OutfitTab
          wardrobe={wardrobe}
          palette={palette}
          onMarkOutfitWorn={markOutfitWorn}
        />
      </div>
    </div>
  )
}

export default App
