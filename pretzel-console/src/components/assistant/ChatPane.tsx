import { useEffect, useRef } from 'react'
import type { ChatMessage, ChatSession } from '../../types'
import { MessageBubble } from './MessageBubble'
import { ChatInput } from './ChatInput'
import { SessionTabs } from './SessionTabs'

interface ChatPaneProps {
  sessions:         ChatSession[]
  messages:         ChatMessage[]
  activeSessionId:  string | null
  isSending:        boolean
  onSend:           (message: string) => void
  onSelectSession:  (id: string) => void
  onNewSession:     () => void
  pendingMessageId: string | null
  error?:           string | null
  onRetry?:         () => void
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'color-mix(in srgb, var(--status-danger, #ef4444) 12%, transparent)',
      border: '1px solid color-mix(in srgb, var(--status-danger, #ef4444) 40%, transparent)',
      borderRadius: 10, padding: '10px 14px',
      fontSize: 12, color: 'var(--status-danger, #ef4444)',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: 'none', border: '1px solid currentColor', borderRadius: 6,
            color: 'inherit', fontSize: 12, fontWeight: 600, padding: '4px 10px', cursor: 'pointer',
          }}
        >
          Retry
        </button>
      )}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
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
      <div style={{
        background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
        borderRadius: '4px 16px 16px 16px',
        padding: '12px 18px',
        display: 'flex', gap: 5, alignItems: 'center',
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 7, height: 7, borderRadius: '50%',
            background: 'var(--brand-primary)',
            display: 'block',
            animation: `pretzel-dot-bounce 1.3s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 14, padding: 40, textAlign: 'center',
    }}>
      <div style={{
        width: 60, height: 60, borderRadius: '50%',
        background: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
        border: '1.5px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
          <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" fill="var(--brand-primary)"/>
        </svg>
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
          How can I help you today?
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7, maxWidth: 300 }}>
          Describe a policy change in plain English — I'll propose the exact rules and subjects to create, update, or delete.
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 320, marginTop: 4 }}>
        {[
          'Block all prompts containing API keys',
          'Warn when finance team sends revenue data',
          'Delete all rules on the HR subject',
        ].map(hint => (
          <div key={hint} style={{
            padding: '8px 14px', borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--bg-surface-raised)',
            fontSize: 11, color: 'var(--text-muted)',
            textAlign: 'left', cursor: 'default',
          }}>
            "{hint}"
          </div>
        ))}
      </div>
    </div>
  )
}

export function ChatPane({
  sessions, messages, activeSessionId, isSending,
  onSend, onSelectSession, onNewSession, error, onRetry,
}: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  const isEmpty = messages.length === 0 && !isSending

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
      <style>{`
        @keyframes pretzel-msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pretzel-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.3; }
          30%            { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'var(--brand-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 10px color-mix(in srgb, var(--brand-primary) 38%, transparent)',
        }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5Z" fill="white"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>AI Assistant</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Pretzel AI</div>
        </div>
        <div style={{
          marginLeft: 'auto',
          fontSize: 9, fontWeight: 700, letterSpacing: '0.6px',
          color: '#4ade80',
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.22)',
          borderRadius: 20, padding: '3px 9px',
        }}>
          ONLINE
        </div>
      </div>

      <SessionTabs
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={onSelectSession}
        onNew={onNewSession}
      />

      {/* Messages */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isEmpty ? 0 : '20px 20px 8px',
        display: 'flex', flexDirection: 'column', gap: 14,
        background: 'var(--bg-base)',
      }}>
        {isEmpty
          ? <EmptyState />
          : messages.map(msg => (
              <MessageBubble key={msg.id} message={msg} isLatest={false} isPending={false} />
            ))
        }
        {isSending && <TypingIndicator />}
        {error && <ErrorBanner message={error} onRetry={onRetry} />}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} disabled={isSending} />
    </div>
  )
}
