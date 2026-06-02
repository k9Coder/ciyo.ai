import { ActionItem } from './ActionItem'

interface PreviewPaneProps {
  actions:    unknown[]
  messageId:  string
  onApply:    (messageId: string) => void
  onDiscard:  () => void
  isApplying: boolean
}

export function PreviewPane({ actions, messageId, onApply, onDiscard, isApplying }: PreviewPaneProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Proposed Changes</span>
        {actions.length > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-surface-raised)',
                         border: '1px solid var(--border)', borderRadius: 10, padding: '1px 7px' }}>
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: actions.length ? '12px 16px' : 0 }}>
        {actions.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>
            Proposed changes will appear here after the assistant responds.
          </div>
        ) : (
          actions.map((action, i) => (
            <ActionItem key={i} action={action as Record<string, unknown>} />
          ))
        )}
      </div>

      {actions.length > 0 && (
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)',
                      background: 'var(--bg-surface)', display: 'flex', gap: 8 }}>
          <button
            onClick={() => onApply(messageId)}
            disabled={isApplying}
            style={{
              flex: 1, background: 'var(--brand-primary)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '10px 0', fontSize: 12, fontWeight: 600,
              cursor: isApplying ? 'not-allowed' : 'pointer', opacity: isApplying ? 0.7 : 1,
            }}
          >
            {isApplying ? 'Applying...' : 'Apply Changes'}
          </button>
          <button
            onClick={onDiscard}
            style={{
              background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            Discard
          </button>
        </div>
      )}
    </div>
  )
}
