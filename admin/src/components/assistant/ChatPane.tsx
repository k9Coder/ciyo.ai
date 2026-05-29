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
}

export function ChatPane({
  sessions, messages, activeSessionId, isSending,
  onSend, onSelectSession, onNewSession,
}: ChatPaneProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, isSending])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', minWidth: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Assistant</span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>ciyo AI policy manager</span>
      </div>

      <SessionTabs
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelect={onSelectSession}
        onNew={onNewSession}
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.length === 0 && !isSending && (
          <div style={{ color: 'var(--text-muted)', fontSize: 12, textAlign: 'center', marginTop: 32 }}>
            Start by describing a rule or policy change you'd like to make.
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            isLatest={i === messages.length - 1}
            isPending={false}
          />
        ))}
        {isSending && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--brand-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10 }}>*</div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Thinking...</span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <ChatInput onSend={onSend} disabled={isSending} />
    </div>
  )
}
