interface Props {
  open: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
  confirming?: boolean
}

export function ConfirmModal({ open, message, onClose, onConfirm, confirming }: Props) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <div role="dialog" aria-modal="true" style={{
        position: 'relative', background: 'var(--bg-surface)', borderRadius: 12,
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)', width: '100%', maxWidth: 384,
        margin: '0 16px', padding: 24, border: '1px solid var(--border)',
      }}>
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
              border: 'none', borderRadius: 6, cursor: 'pointer',
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
