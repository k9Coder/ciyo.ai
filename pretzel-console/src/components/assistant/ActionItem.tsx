interface ActionItemProps {
  action: Record<string, unknown>
}

const OP_COLOR: Record<string, { bg: string; border: string; text: string; label: string }> = {
  create_rule:    { bg: '#1a2a1a', border: '#2a3a2a', text: '#4caf50', label: '+ CREATE RULE' },
  update_rule:    { bg: '#1a1a2a', border: '#2a2a3a', text: '#2196f3', label: '~ UPDATE RULE' },
  delete_rule:    { bg: '#2a1a1a', border: '#3a2a2a', text: '#f44336', label: '- DELETE RULE' },
  create_subject: { bg: '#1a2a1a', border: '#2a3a2a', text: '#4caf50', label: '+ CREATE SUBJECT' },
  update_subject: { bg: '#1a1a2a', border: '#2a2a3a', text: '#2196f3', label: '~ UPDATE SUBJECT' },
  delete_subject: { bg: '#2a1a1a', border: '#3a2a2a', text: '#f44336', label: '- DELETE SUBJECT' },
}

export function ActionItem({ action }: ActionItemProps) {
  const op     = action.op as string
  const colors = OP_COLOR[op] ?? { bg: 'var(--bg-surface-raised)', border: 'var(--border)', text: 'var(--text-muted)', label: op }
  const fields = Object.entries(action).filter(([k]) => k !== 'op')

  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
      <div style={{ background: colors.bg, padding: '6px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: colors.text, fontSize: 10, fontWeight: 700, fontFamily: 'monospace' }}>{colors.label}</span>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {fields.map(([key, value]) => (
          <div key={key} style={{ fontSize: 11, fontFamily: 'monospace', marginBottom: 2 }}>
            <span style={{ color: 'var(--text-primary)' }}>{key}:</span>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
