interface Props {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '64px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)', margin: 0 }}>{title}</p>
      {description && <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--muted)', marginTop: 6, marginBottom: 0, maxWidth: 420 }}>{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          style={{ marginTop: 16, fontSize: 14, fontWeight: 500, color: 'var(--btn-fg)',
                   background: 'var(--btn-bg)', border: 'none', borderRadius: 'var(--r-btn)',
                   cursor: 'pointer', padding: '9px 16px' }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
