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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--bg)' }}>
      <div style={{
        padding: '18px 20px 6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
      }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)' }}>Proposed Changes</span>
        {actions.length > 0 && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>
            {actions.length} action{actions.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: actions.length ? '10px 20px' : 0 }}>
        {actions.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: '100%', color: 'var(--muted)', fontSize: 15, textAlign: 'center', padding: 24 }}>
            Proposed changes will appear here after the assistant responds.
          </div>
        ) : (
          actions.map((action, i) => (
            <ActionItem key={i} action={action as Record<string, unknown>} />
          ))
        )}
      </div>

      {actions.length > 0 && (
        <div style={{ padding: '12px 20px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Nothing changes until you apply. Applied changes can be reverted from the chat.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onApply(messageId)}
              disabled={isApplying}
              style={{
                flex: 1, background: 'var(--btn-bg)', color: 'var(--btn-fg)', border: 'none',
                borderRadius: 'var(--r-btn)', padding: 10, fontSize: 14, fontWeight: 500,
                cursor: isApplying ? 'not-allowed' : 'pointer', opacity: isApplying ? 0.7 : 1,
              }}
            >
              {isApplying ? 'Applying...' : 'Apply Changes'}
            </button>
            <button
              onClick={onDiscard}
              style={{
                background: 'var(--fill)', border: 'none', color: 'var(--ink)',
                borderRadius: 'var(--r-btn)', padding: '10px 16px', fontSize: 14, cursor: 'pointer',
              }}
            >
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
