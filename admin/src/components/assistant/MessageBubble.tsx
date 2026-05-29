import type { ChatMessage } from '../../types'

interface MessageBubbleProps {
  message:   ChatMessage
  isLatest:  boolean
  isPending: boolean
}

function SparkleAvatar() {
  return (
    <div style={{
      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
      background: 'var(--brand-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 0 14px color-mix(in srgb, var(--brand-primary) 45%, transparent)',
    }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" fill="white"/>
      </svg>
    </div>
  )
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser     = message.role === 'user'
  const hasActions = Array.isArray(message.actionsJson) && message.actionsJson.length > 0
  const isApplied  = !!message.appliedAt
  const count      = hasActions ? (message.actionsJson as unknown[]).length : 0

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      animation: 'ciyo-msg-in 0.22s ease-out forwards',
    }}>
      {!isUser && <SparkleAvatar />}

      <div style={{
        maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 6,
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}>
        <div style={{
          background: isUser ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
          border: isUser ? 'none' : '1px solid var(--border)',
          borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
          padding: '10px 14px',
          boxShadow: isUser
            ? '0 2px 14px color-mix(in srgb, var(--brand-primary) 30%, transparent)'
            : '0 1px 4px rgba(0,0,0,0.12)',
        }}>
          <p style={{
            margin: 0,
            color: isUser ? '#fff' : 'var(--text-primary)',
            fontSize: 13, lineHeight: 1.65,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {message.content}
          </p>
        </div>

        {hasActions && !isApplied && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
            border: '1px solid color-mix(in srgb, var(--brand-primary) 25%, transparent)',
            borderRadius: 20, padding: '3px 10px',
            fontSize: 11, color: 'var(--brand-primary)', fontWeight: 500,
          }}>
            <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
              <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" fill="currentColor"/>
            </svg>
            {count} proposed change{count !== 1 ? 's' : ''} · review in preview
          </div>
        )}

        {isApplied && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'rgba(74,222,128,0.08)',
            border: '1px solid rgba(74,222,128,0.28)',
            borderRadius: 20, padding: '3px 10px',
            fontSize: 11, color: '#4ade80', fontWeight: 500,
          }}>
            ✓ {count} change{count !== 1 ? 's' : ''} applied
          </div>
        )}
      </div>
    </div>
  )
}
