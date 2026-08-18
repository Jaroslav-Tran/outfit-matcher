import { useEffect, useRef, useState } from 'react'
import PaletteTab from './components/PaletteTab.jsx'
import WardrobeTab from './components/WardrobeTab.jsx'
import OutfitTab from './components/OutfitTab.jsx'
import { createSampleData } from './lib/sampleData.js'
import { revokeIfBlobUrl } from './lib/imageUtils.js'
import './App.css'

const TABS = [
  { id: 'palette', label: 'My Palette' },
  { id: 'wardrobe', label: 'My Wardrobe' },
  { id: 'outfit', label: 'Generate Outfit' },
]

function App() {
  const [tab, setTab] = useState('palette')
  const [palette, setPalette] = useState([])
  const [wardrobe, setWardrobe] = useState([])
  const wardrobeRef = useRef(wardrobe)
  wardrobeRef.current = wardrobe

  useEffect(() => {
    return () => {
      wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    }
  }, [])

  function addPaletteColor(color) {
    setPalette((current) => [...current, color])
  }

  function removePaletteColor(id) {
    setPalette((current) => current.filter((color) => color.id !== id))
  }

  function addWardrobeItem(item) {
    setWardrobe((current) => [...current, item])
  }

  function removeWardrobeItem(id) {
    setWardrobe((current) => {
      const item = current.find((entry) => entry.id === id)
      if (item) revokeIfBlobUrl(item.imageUrl)
      return current.filter((entry) => entry.id !== id)
    })
  }

  function updateWardrobeItem(id, patch) {
    setWardrobe((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    )
  }

  function loadSampleData() {
    wardrobeRef.current.forEach((item) => revokeIfBlobUrl(item.imageUrl))
    const sample = createSampleData()
    setPalette(sample.palette)
    setWardrobe(sample.wardrobe)
    setTab('wardrobe')
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">Local only · session state</p>
          <h1>Outfit Matcher</h1>
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

      <div hidden={tab !== 'palette'}>
        <PaletteTab
          palette={palette}
          onAddColor={addPaletteColor}
          onRemoveColor={removePaletteColor}
        />
      </div>
      <div hidden={tab !== 'wardrobe'}>
        <WardrobeTab
          wardrobe={wardrobe}
          onAddItem={addWardrobeItem}
          onRemoveItem={removeWardrobeItem}
          onUpdateItem={updateWardrobeItem}
          onLoadSample={loadSampleData}
        />
      </div>
      <div hidden={tab !== 'outfit'}>
        <OutfitTab wardrobe={wardrobe} palette={palette} />
      </div>
    </div>
  )
}

export default App
