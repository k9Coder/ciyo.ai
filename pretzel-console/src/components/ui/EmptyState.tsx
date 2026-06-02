interface Props {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  padding: '64px 0', textAlign: 'center' }}>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', margin: 0 }}>{title}</p>
      {description && <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          style={{ marginTop: 16, fontSize: 13, fontWeight: 500, color: 'var(--brand-primary)',
                   background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
