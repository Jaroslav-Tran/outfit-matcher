import { CATEGORIES, toggleCategory } from '../lib/constants.js'

export default function CategoryPills({ value, onChange, legend = 'Category', disabled = false }) {
  const selected = Array.isArray(value) ? value : value ? [value] : []

  return (
    <fieldset className="season-pills" disabled={disabled}>
      <legend>{legend}</legend>
      {CATEGORIES.map((category) => {
        const on = selected.includes(category)
        return (
          <label key={category} className={`season-pill${on ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={() => onChange(toggleCategory(selected, category))}
            />
            {category}
          </label>
        )
      })}
    </fieldset>
  )
}
