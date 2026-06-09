import { useEffect, useRef, useId } from 'react'

interface Props {
  open: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
  confirming?: boolean
}

/** Returns all keyboard-focusable elements inside a container. */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  )
}

export function ConfirmModal({ open, message, onClose, onConfirm, confirming }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  const titleId = useId()

  // Save trigger element and move focus to Cancel button on open.
  // ARIA pattern for destructive dialogs: focus Cancel first to prevent
  // accidental confirmation by spacebar-happy users.
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      const id = setTimeout(() => {
        if (!dialogRef.current) return
        const focusable = getFocusable(dialogRef.current)
        // Focus the Cancel button (first focusable element) to prevent
        // accidental deletion by keyboard users pressing Space/Enter.
        focusable[0]?.focus()
      }, 0)
      return () => clearTimeout(id)
    } else {
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
  }, [open])

  // Escape key closes the modal.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Focus trap: keep Tab / Shift+Tab cycling within the dialog.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = getFocusable(dialogRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          position: 'relative', background: 'var(--bg-surface)', borderRadius: 12,
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)', width: '100%', maxWidth: 384,
          margin: '0 16px', padding: 24, border: '1px solid var(--border)',
        }}
      >
        <h2 id={titleId} style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>
          Confirm Delete
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 24px' }}>{message}</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '7px 16px', fontSize: 13, color: 'var(--text-secondary)',
              background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
              borderRadius: 6, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              color: '#fff', background: 'var(--status-danger)',
              border: 'none', borderRadius: 6, cursor: confirming ? 'not-allowed' : 'pointer',
              opacity: confirming ? 0.5 : 1,
            }}
          >
            {confirming ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
