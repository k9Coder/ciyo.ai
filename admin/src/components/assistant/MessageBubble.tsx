import type { ChatMessage } from '../../types'

interface MessageBubbleProps {
  message:   ChatMessage
  isLatest:  boolean
  isPending: boolean
}

export function MessageBubble({ message, isPending }: MessageBubbleProps) {
  const isUser     = message.role === 'user'
  const hasActions = Array.isArray(message.actionsJson) && message.actionsJson.length > 0
  const isApplied  = !!message.appliedAt

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        background: isUser ? 'var(--bg-surface-raised)' : 'var(--brand-primary)',
        border: isUser ? '1px solid var(--border)' : 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 10,
      }}>
        {!isUser && '*'}
      </div>
      <div style={{ maxWidth: '80%' }}>
        <div style={{
          background: isUser ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
          border: isUser ? 'none' : '1px solid var(--border)',
          borderRadius: 8,
          borderTopLeftRadius: isUser ? 8 : 2,
          borderTopRightRadius: isUser ? 2 : 8,
          padding: '8px 12px',
        }}>
          <span style={{ color: isUser ? '#fff' : 'var(--text-primary)', fontSize: 12, lineHeight: 1.5 }}>
            {message.content}
          </span>
        </div>
        {hasActions && (
          <div style={{
            marginTop: 4, fontSize: 10, color: isApplied ? '#4caf50' : 'var(--brand-primary)',
            background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
            borderRadius: 6, padding: '3px 8px', display: 'inline-block',
          }}>
            {isApplied
              ? `Applied ${(message.actionsJson as unknown[]).length} change(s)`
              : `${(message.actionsJson as unknown[]).length} proposed change(s) - review in preview pane`}
          </div>
        )}
        {isPending && (
          <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)' }}>Thinking...</div>
        )}
      </div>
    </div>
  )
}
