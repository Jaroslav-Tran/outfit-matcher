import { themeToggleAriaLabel } from '../lib/theme.js'

function IconSystem() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2.5a7.5 7.5 0 0 1 0 15Z" fill="currentColor" />
    </svg>
  )
}

function IconSun() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="3.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.1 1.1M14.2 14.2l1.1 1.1M4.7 15.3l1.1-1.1M14.2 5.8l1.1-1.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconMoon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M15.5 11.2A6.2 6.2 0 0 1 8.8 4.5 6.5 6.5 0 1 0 15.5 11.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function ThemeToggle({ preference, onCycle, className = '' }) {
  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`.trim()}
      aria-label={themeToggleAriaLabel(preference)}
      title={themeToggleAriaLabel(preference)}
      onClick={onCycle}
    >
      {preference === 'dark' ? (
        <IconMoon />
      ) : preference === 'light' ? (
        <IconSun />
      ) : (
        <IconSystem />
      )}
    </button>
  )
}
