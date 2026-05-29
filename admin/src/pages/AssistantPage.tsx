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

  function handleSend(message: string) {
    setDiscarded(null)
    send.mutate({ message })
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
