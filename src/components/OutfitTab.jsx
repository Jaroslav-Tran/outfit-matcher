import { useEffect, useState } from 'react'
import { generateOutfits, localDateISO } from '../lib/outfitGenerator.js'
import { SCHEME_LABELS } from '../lib/colorUtils.js'
import { FORMALITIES, SEASONS, fitLabel } from '../lib/constants.js'

const FORMALITY_FILTERS = ['any', ...FORMALITIES]
const SEASON_FILTERS = ['any', ...SEASONS]

function slotItems(outfit) {
  return [
    outfit.top,
    outfit.bottom,
    outfit.shoes,
    outfit.outerwear,
    ...outfit.accessories,
  ].filter(Boolean)
}

export default function OutfitTab({ wardrobe, palette, onMarkOutfitWorn }) {
  const [formalityFilter, setFormalityFilter] = useState('any')
  const [seasonFilter, setSeasonFilter] = useState('any')
  const [results, setResults] = useState(null)
  const [markingScheme, setMarkingScheme] = useState('')
  const [markNotice, setMarkNotice] = useState('')

  useEffect(() => {
    setResults(null)
    setMarkNotice('')
  }, [palette, formalityFilter, seasonFilter])

  function handleGenerate(event) {
    event.preventDefault()
    setMarkNotice('')
    const outfits = generateOutfits(
      wardrobe,
      palette,
      formalityFilter,
      seasonFilter,
    )
    setResults(outfits)
  }

  async function handleMarkWorn(outfit) {
    if (!onMarkOutfitWorn) return
    setMarkingScheme(outfit.colorScheme)
    setMarkNotice('')
    const iso = localDateISO()
    const ids = slotItems(outfit).map((item) => item.id)
    try {
      await onMarkOutfitWorn(ids)
      setResults((current) =>
        (current || []).map((look) => ({
          ...look,
          top: look.top && ids.includes(look.top.id) ? { ...look.top, lastWorn: iso } : look.top,
          bottom:
            look.bottom && ids.includes(look.bottom.id)
              ? { ...look.bottom, lastWorn: iso }
              : look.bottom,
          shoes:
            look.shoes && ids.includes(look.shoes.id) ? { ...look.shoes, lastWorn: iso } : look.shoes,
          outerwear:
            look.outerwear && ids.includes(look.outerwear.id)
              ? { ...look.outerwear, lastWorn: iso }
              : look.outerwear,
          accessories: look.accessories.map((item) =>
            ids.includes(item.id) ? { ...item, lastWorn: iso } : item,
          ),
          items: look.items.map((item) =>
            ids.includes(item.id) ? { ...item, lastWorn: iso } : item,
          ),
        })),
      )
      setMarkNotice('Marked as worn today. Generate again to refresh ranking.')
    } catch {
      // App surfaces persistError.
    } finally {
      setMarkingScheme('')
    }
  }

  return (
    <section className="panel">
      <h2>Generate Outfit</h2>
      <p className="lede">
        Builds combinations of top + bottom + shoes, with optional outerwear and
        up to two accessories. Shows one best-scoring look per detected color
        scheme (neutral-only, monochromatic, analogous, complementary). Every
        piece must match the formality filter and be tagged for the selected
        season. Recently worn pieces score lower but still appear.
      </p>

      <form className="toolbar" onSubmit={handleGenerate}>
        <label className="field inline">
          <span>Formality</span>
          <select
            value={formalityFilter}
            onChange={(event) => setFormalityFilter(event.target.value)}
          >
            {FORMALITY_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="field inline">
          <span>Season</span>
          <select
            value={seasonFilter}
            onChange={(event) => setSeasonFilter(event.target.value)}
          >
            {SEASON_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="submit">Generate</button>
      </form>

      {markNotice ? <p className="hint">{markNotice}</p> : null}

      {results === null ? (
        <p className="empty">Choose filters and click Generate.</p>
      ) : results.length === 0 ? (
        <p className="empty notice">
          Not enough matching pieces yet — add more items or relax the formality
          or season filter
        </p>
      ) : (
        <ol className="outfit-list">
          {results.map((outfit) => (
            <li
              key={outfit.colorScheme}
              className="outfit-card"
            >
              <header>
                <h3>{SCHEME_LABELS[outfit.colorScheme] || outfit.colorScheme}</h3>
                <div className="badges">
                  <span className="badge">{outfit.formality}</span>
                  {seasonFilter !== 'any' ? (
                    <span className="badge">{seasonFilter}</span>
                  ) : null}
                  <span className="badge">score {outfit.score.toFixed(1)}</span>
                </div>
              </header>
              <ul className="outfit-pieces">
                {slotItems(outfit).map((item) => (
                  <li key={item.id}>
                    <img src={item.imageUrl} alt={item.label || item.category} />
                    <span className="swatch-chip small" style={{ background: item.hex }} />
                    <span>{item.label || item.category}</span>
                    <span className="muted">{fitLabel(item.fit, item.category)}</span>
                    {item.lastWorn ? (
                      <span className="muted">worn {item.lastWorn}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="explanation">{outfit.explanation}</p>
              <button
                type="button"
                className="secondary"
                disabled={markingScheme === outfit.colorScheme}
                onClick={() => handleMarkWorn(outfit)}
              >
                {markingScheme === outfit.colorScheme ? 'Saving…' : 'Mark as worn'}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
