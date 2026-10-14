export default function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label className={`switch${disabled ? ' is-disabled' : ''}`}>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="switch-track" aria-hidden="true" />
      {label ? <span>{label}</span> : null}
    </label>
  )
}
