import { X } from 'lucide-react'
import { useEffect } from 'react'

export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-card border border-border bg-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="serif text-base font-semibold">{title}</h2>
          <button
            aria-label="Close"
            onClick={onClose}
            className="rounded-card p-1 text-muted hover:bg-accent-soft"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </div>
    </div>
  )
}
