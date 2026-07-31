import { useEffect, useRef } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Accessible modal shell used by every dialog-style overlay in the app: click
// outside (or Escape, from anywhere inside — not just an input) to close,
// role="dialog"/aria-modal so screen readers announce it as one, focus moved
// into the dialog on open and back to whatever triggered it on close, and
// Tab/Shift+Tab wrapped so keyboard focus can't silently leave the dialog
// while it's open.
function Modal({
  onClose,
  label,
  labelledBy,
  align = 'center',
  className,
  children
}: {
  onClose: () => void
  // Exactly one of these names the dialog for assistive tech — labelledBy
  // points at an element id (e.g. the modal's own <h3>), label is a plain string.
  label?: string
  labelledBy?: string
  align?: 'center' | 'top'
  className?: string
  children: ReactNode
}): JSX.Element {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    ;(focusables?.[0] ?? dialogRef.current)?.focus()
    return () => { previouslyFocused.current?.focus?.() }
  }, [])

  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
    if (e.key !== 'Tab') return
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (!focusables || focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    // The backdrop's onClick (click-outside-to-close) is a mouse-only
    // convenience layered behind a fully keyboard-accessible dialog: its
    // onKeyDown provides the real keyboard equivalent (Escape, from anywhere
    // inside, via bubbling) rather than requiring this div itself to be
    // focusable — it isn't meant to be, only the dialog content is.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className={`fixed inset-0 z-50 flex justify-center bg-black/50 p-6 ${align === 'top' ? 'items-start pt-24' : 'items-center'}`}
      onClick={onClose}
      onKeyDown={onKeyDown}
    >
      {/* onClick here only stops the backdrop's close-on-click from seeing
          clicks inside the dialog — not a user-facing interaction, so it
          has no keyboard equivalent to add. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={className}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

export default Modal
