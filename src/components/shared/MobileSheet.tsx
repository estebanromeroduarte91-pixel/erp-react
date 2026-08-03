import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface MobileSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  maxWidth?: string
}

export function MobileSheet({ open, onClose, title, description, children, footer, maxWidth = 'max-w-md' }: MobileSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function keydown(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab') return
      const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]') ?? [])
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', keydown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-end md:items-center justify-center md:p-4">
      <button type="button" aria-label="Cerrar" onClick={onClose} className="absolute inset-0 w-full h-full bg-black/50 cursor-default" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={`relative z-10 bg-white w-full ${maxWidth} rounded-t-2xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh]`}>
        <div className="md:hidden w-10 h-1 rounded-full bg-gray-300 mx-auto mt-2.5 flex-shrink-0" />
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h2 id={titleId} className="text-base font-bold text-gray-900">{title}</h2>
            {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 -mr-2 -mt-1 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain flex-1">{children}</div>
        {footer && (
          <footer className="flex-shrink-0 border-t border-gray-100 bg-gray-50 px-5 pt-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
