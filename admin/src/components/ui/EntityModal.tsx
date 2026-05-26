import { useEffect } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  onSave: () => void
  saving?: boolean
  children: React.ReactNode
}

export function EntityModal({ open, title, onClose, onSave, saving, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div style={{
        position: 'relative', background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', width: '100%', maxWidth: 448,
        margin: '0 16px', padding: 24, border: '1px solid var(--border)',
      }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>{title}</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>{children}</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
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
            onClick={onSave}
            disabled={saving}
            style={{
              padding: '7px 16px', fontSize: 13, fontWeight: 600,
              color: 'var(--bg-base)', background: 'var(--brand-primary)',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: saving ? 0.5 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
