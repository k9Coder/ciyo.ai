import { useEffect, useRef } from 'react'
import type { ChatMessage, ChatSession } from '../../types'
import { MessageBubble, AssistantAvatar } from './MessageBubble'
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
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: 10,
      background: 'var(--block-fill)',
      borderRadius: 'var(--r)', padding: '12px 16px',
      fontSize: 15, color: 'var(--block)',
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            background: 'var(--surface)', border: 'none', borderRadius: 'var(--r-btn)',
            color: 'var(--block)', fontSize: 14, fontWeight: 500, padding: '6px 14px', cursor: 'pointer',
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
    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <AssistantAvatar size={30} />
      <div style={{
        background: 'var(--fill)', borderRadius: '4px var(--r) var(--r) var(--r)',
        padding: '14px 16px', display: 'flex', gap: 5, alignItems: 'center',
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6, height: 6, borderRadius: '50%', background: 'var(--muted)', display: 'block',
            animation: `pretzel-dot-pulse 1.2s ease-in-out ${i * 0.18}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

const CAPABILITIES = [
  { t: 'Policies & rules', d: 'Create, edit or delete what Pretzel looks for.' },
  { t: 'Divisions & teams', d: 'Add or remove the groups people belong to.' },
  { t: 'People', d: 'Add members and move them between teams.' },
  { t: 'Nothing is silent', d: 'Every change is a card you apply or undo.' },
]

const SUGGESTIONS = [
  'Block all prompts containing API keys',
  'Warn when finance team sends revenue data',
  'Delete all rules on the HR subject',
]

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 20, padding: 32, textAlign: 'center',
    }}>
      <div style={{ marginTop: 'auto' }}>
        <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.015em', color: 'var(--ink)', marginBottom: 8 }}>
          How can I help you today?
        </div>
        <div style={{ fontSize: 15, color: 'var(--muted)', lineHeight: 1.55, maxWidth: 380 }}>
          Describe a policy change in plain English — I'll propose the exact rules and subjects to create, update, or delete.
        </div>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: 6, width: '100%', maxWidth: 480, textAlign: 'left',
      }}>
        {CAPABILITIES.map(c => (
          <div key={c.t} style={{
            border: '1px solid var(--line)', borderRadius: 'var(--r-sm)', padding: '10px 12px',
            display: 'flex', flexDirection: 'column', gap: 3,
          }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{c.t}</span>
            <span style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.4 }}>{c.d}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', maxWidth: 380, marginBottom: 'auto' }}>
        {SUGGESTIONS.map(hint => (
          <div key={hint} style={{
            padding: '8px 14px', borderRadius: 'var(--r-btn)',
            border: '1px solid var(--line)', fontSize: 14, color: 'var(--muted)',
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
    bottomRef.current?.scrollIntoView?.({ behavior: 'smooth' })
  }, [messages.length, isSending])

  const isEmpty = messages.length === 0 && !isSending

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--line)', minWidth: 0 }}>
      <style>{`
        @keyframes pretzel-msg-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pretzel-dot-pulse {
          0%, 80%, 100% { opacity: 0.25; }
          40%           { opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '16px 24px', borderBottom: '1px solid var(--line)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <AssistantAvatar size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            Pretzel Assistant
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 500, padding: '2px 7px',
              borderRadius: 'var(--r-btn)', background: 'var(--brand-soft)', color: 'var(--brand)',
            }}>AI</span>
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Can create, edit and delete policies, rules, teams and people
          </div>
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
        padding: isEmpty ? 0 : '24px 24px 8px',
        display: 'flex', flexDirection: 'column', gap: 22,
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
