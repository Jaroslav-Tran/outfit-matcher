import { SEASONS, toggleSeason } from '../lib/constants.js'

export default function SeasonPills({ value, onChange, legend = 'Seasons', disabled = false }) {
  return (
    <fieldset className="season-pills" disabled={disabled}>
      <legend>{legend}</legend>
      {SEASONS.map((season) => {
        const on = value.includes(season)
        return (
          <label key={season} className={`season-pill${on ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={() => onChange(toggleSeason(value, season))}
            />
            {season}
          </label>
        )
      })}
    </fieldset>
  )
}
