import type { ChatMessage } from '../../types'
import { useRevertMessage } from '../../hooks/useAssistant'
import { PretzelLogo } from '../layout/PretzelLogo'

interface MessageBubbleProps {
  message:   ChatMessage
  isLatest:  boolean
  isPending: boolean
}

export function AssistantAvatar({ size = 30 }: { size?: number }) {
  return <PretzelLogo size={size} />
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser     = message.role === 'user'
  const hasActions = Array.isArray(message.actionsJson) && message.actionsJson.length > 0
  const isApplied  = !!message.appliedAt
  const count      = hasActions ? (message.actionsJson as unknown[]).length : 0
  const revert     = useRevertMessage()

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: isUser ? 'flex-end' : 'flex-start',
      flexDirection: isUser ? 'row-reverse' : 'row',
      animation: 'pretzel-msg-in 0.22s ease-out forwards',
    }}>
      {!isUser && <AssistantAvatar size={30} />}

      <div style={{
        maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 8,
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}>
        <div style={{
          background: isUser ? 'var(--btn-bg)' : 'var(--fill)',
          borderRadius: isUser ? 'var(--r) var(--r) 4px var(--r)' : '4px var(--r) var(--r) var(--r)',
          padding: '12px 16px',
        }}>
          <p style={{
            margin: 0,
            color: isUser ? 'var(--btn-fg)' : 'var(--ink)',
            fontSize: 15, lineHeight: 1.55,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {message.content}
          </p>
        </div>

        {hasActions && !isApplied && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            background: 'var(--brand-soft)', borderRadius: 'var(--r-btn)', padding: '4px 12px',
            fontSize: 13, color: 'var(--brand)', fontWeight: 500,
          }}>
            {count} proposed change{count !== 1 ? 's' : ''} · review in preview
          </div>
        )}

        {isApplied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              background: 'var(--brand-soft)', borderRadius: 'var(--r-btn)', padding: '4px 12px',
              fontSize: 13, color: 'var(--brand)', fontWeight: 500,
            }}>
              ✓ {count} change{count !== 1 ? 's' : ''} applied
            </div>
            {message.hasVersionSnapshot && (
              <button
                onClick={() => revert.mutate(message.id)}
                disabled={revert.isPending}
                style={{
                  background: 'none', border: 'none', padding: '2px 4px',
                  fontSize: 13, color: 'var(--muted)', cursor: 'pointer',
                  textDecoration: 'underline', opacity: revert.isPending ? 0.5 : 1,
                }}
              >
                {revert.isPending ? 'Reverting…' : 'Revert changes from this message'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
