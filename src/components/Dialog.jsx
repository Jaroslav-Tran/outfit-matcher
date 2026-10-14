import { useEffect } from 'react'

export default function Dialog({ title, onClose, children }) {
  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="dialog-header">
          <h3>{title}</h3>
          <button type="button" className="secondary" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}
