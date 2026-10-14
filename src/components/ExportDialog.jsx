import { useState } from 'react'
import Dialog from './Dialog.jsx'
import { CATEGORIES, FORMALITIES, SEASONS, WARMTHS } from '../lib/constants.js'
import { WARDROBE_EXPORT_FIELDS } from '../lib/exportCloset.js'

const FIELD_LABELS = {
  id: 'Id',
  hex: 'Hex',
  label: 'Label',
  category: 'Category',
  formality: 'Formality',
  fit: 'Fit',
  warmth: 'Warmth',
  length: 'Length',
  seasons: 'Seasons',
  is_neutral: 'Neutral',
  image_path: 'Image path',
  last_worn: 'Last worn',
  created_at: 'Created',
}

function toggleValue(list, value) {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]
}

function FilterChecks({ legend, options, value, onChange }) {
  return (
    <fieldset className="season-pills">
      <legend>{legend}</legend>
      {options.map((option) => {
        const on = value.includes(option.value)
        return (
          <label key={option.value} className={`season-pill${on ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(toggleValue(value, option.value))}
            />
            {option.label}
          </label>
        )
      })}
    </fieldset>
  )
}

export default function ExportDialog({ exporting, onClose, onExport }) {
  const [fields, setFields] = useState(() => [...WARDROBE_EXPORT_FIELDS])
  const [includePalette, setIncludePalette] = useState(true)
  const [categories, setCategories] = useState([])
  const [formalities, setFormalities] = useState([])
  const [seasons, setSeasons] = useState([])
  const [warmths, setWarmths] = useState([])

  function handleSubmit(event) {
    event.preventDefault()
    if (!fields.length) return
    onExport({
      fields,
      includePalette,
      categories,
      formalities,
      seasons,
      warmths,
    })
  }

  return (
    <Dialog title="Export closet" onClose={onClose}>
      <form className="stack" onSubmit={handleSubmit}>
        <p className="hint">
          Choose which clothing properties to include. Leave a filter empty to export every item.
        </p>
        <fieldset className="season-pills">
          <legend>Properties</legend>
          {WARDROBE_EXPORT_FIELDS.map((field) => {
            const on = fields.includes(field)
            return (
              <label key={field} className={`season-pill${on ? ' is-on' : ''}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => setFields((current) => toggleValue(current, field))}
                />
                {FIELD_LABELS[field] || field}
              </label>
            )
          })}
        </fieldset>
        <label className="checkbox compact">
          <input
            type="checkbox"
            checked={includePalette}
            onChange={(event) => setIncludePalette(event.target.checked)}
          />
          Include palette colors
        </label>
        <FilterChecks
          legend="Category"
          options={CATEGORIES.map((value) => ({ value, label: value }))}
          value={categories}
          onChange={setCategories}
        />
        <FilterChecks
          legend="Formality"
          options={FORMALITIES.map((value) => ({ value, label: value }))}
          value={formalities}
          onChange={setFormalities}
        />
        <FilterChecks
          legend="Season"
          options={SEASONS.map((value) => ({ value, label: value }))}
          value={seasons}
          onChange={setSeasons}
        />
        <FilterChecks
          legend="Warmth"
          options={[
            ...WARMTHS.map((value) => ({ value, label: value })),
            { value: 'unset', label: 'not set' },
          ]}
          value={warmths}
          onChange={setWarmths}
        />
        {!fields.length ? <p className="error">Select at least one property.</p> : null}
        <button type="submit" className="primary" disabled={exporting || !fields.length}>
          {exporting ? 'Exporting…' : 'Export'}
        </button>
      </form>
    </Dialog>
  )
}
