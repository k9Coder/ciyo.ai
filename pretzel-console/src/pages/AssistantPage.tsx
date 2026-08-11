import { useState } from 'react'
import { ChatPane } from '../components/assistant/ChatPane'
import { PreviewPane } from '../components/assistant/PreviewPane'
import { useAssistantSessions, useAssistantMessages, useAssistantChat, useApplyActions } from '../hooks/useAssistant'
import type { ChatMessage } from '../types'

export function AssistantPage() {
  const { data: sessionsData }                              = useAssistantSessions()
  const { send, sessionId, startNewSession, switchSession } = useAssistantChat()
  const { data: messagesData }                             = useAssistantMessages(sessionId)
  const applyMutation                                      = useApplyActions()

  const messages: ChatMessage[] = messagesData ?? []
  const latestAssistantMsg = [...messages].reverse().find(
    m => m.role === 'assistant' && Array.isArray(m.actionsJson) && m.actionsJson.length > 0 && !m.appliedAt
  ) ?? null

  const [discarded, setDiscarded] = useState<string | null>(null)
  const pendingMsg = latestAssistantMsg?.id !== discarded ? latestAssistantMsg : null

  // Remember the last thing the user tried to send so a failed request (LLM
  // outage, 500, network drop) can be retried without retyping.
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  function handleSend(message: string) {
    setDiscarded(null)
    setLastMessage(message)
    send.mutate({ message })
  }

  function handleRetry() {
    if (lastMessage) send.mutate({ message: lastMessage })
  }

  function handleApply(messageId: string) {
    applyMutation.mutate(messageId)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <ChatPane
        sessions={sessionsData ?? []}
        messages={messages}
        activeSessionId={sessionId}
        isSending={send.isPending}
        onSend={handleSend}
        onSelectSession={(id) => { switchSession(id); setDiscarded(null) }}
        onNewSession={() => { startNewSession(); setDiscarded(null) }}
        pendingMessageId={pendingMsg?.id ?? null}
        error={send.isError ? ((send.error as Error)?.message || 'Something went wrong. Please try again.') : null}
        onRetry={handleRetry}
      />
      {pendingMsg && (
        <PreviewPane
          actions={pendingMsg.actionsJson ?? []}
          messageId={pendingMsg.id}
          onApply={handleApply}
          onDiscard={() => setDiscarded(latestAssistantMsg?.id ?? null)}
          isApplying={applyMutation.isPending}
        />
      )}
    </div>
  )
}
