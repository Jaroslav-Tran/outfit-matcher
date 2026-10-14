export default function SegmentedControl({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
  size = 'md',
  disabled = false,
}) {
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  )
  const count = Math.max(options.length, 1)

  return (
    <div
      className={`segmented ${size === 'sm' ? 'segmented-sm' : ''} ${disabled ? 'is-disabled' : ''} ${className}`.trim()}
      role="tablist"
      aria-label={ariaLabel}
      aria-disabled={disabled}
      style={{ '--segment-count': count, '--segment-index': index }}
    >
      <span className="segmented-indicator" aria-hidden="true" />
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            className={active ? 'segmented-option active' : 'segmented-option'}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
