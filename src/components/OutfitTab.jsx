import { useEffect, useState } from 'react'
import { generateOutfits } from '../lib/outfitGenerator.js'
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

export default function OutfitTab({ wardrobe, palette }) {
  const [formalityFilter, setFormalityFilter] = useState('any')
  const [seasonFilter, setSeasonFilter] = useState('any')
  const [results, setResults] = useState(null)

  useEffect(() => {
    setResults(null)
  }, [wardrobe, palette, formalityFilter, seasonFilter])

  function handleGenerate(event) {
    event.preventDefault()
    const outfits = generateOutfits(
      wardrobe,
      palette,
      formalityFilter,
      seasonFilter,
    )
    setResults(outfits)
  }

  return (
    <section className="panel">
      <h2>Generate Outfit</h2>
      <p className="lede">
        Builds combinations of top + bottom + shoes, with optional outerwear and
        up to two accessories. Shows one best-scoring look per detected color
        scheme (neutral-only, monochromatic, analogous, complementary). Every
        piece must match the formality filter and be tagged for the selected
        season.
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
                  </li>
                ))}
              </ul>
              <p className="explanation">{outfit.explanation}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
