import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

export function useAssistantSessions() {
  return useQuery({
    queryKey: ['assistant-sessions'],
    queryFn: () => api.assistant.sessions().then(r => r.sessions),
  })
}

export function useAssistantMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ['assistant-messages', sessionId],
    queryFn:  () => api.assistant.messages(sessionId!).then(r => r.messages),
    enabled:  !!sessionId,
  })
}

export function useAssistantChat() {
  const qc = useQueryClient()
  const [sessionId, setSessionId] = useState<string | null>(null)

  const send = useMutation({
    mutationFn: ({ message }: { message: string }) =>
      api.assistant.chat(message, sessionId ?? undefined),
    onSuccess: (data) => {
      if (!sessionId) setSessionId(data.sessionId)
      qc.invalidateQueries({ queryKey: ['assistant-messages', data.sessionId] })
      qc.invalidateQueries({ queryKey: ['assistant-sessions'] })
    },
  })

  const startNewSession = () => setSessionId(null)
  const switchSession   = (id: string) => setSessionId(id)

  return { send, sessionId, startNewSession, switchSession }
}

export function useApplyActions() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => api.assistant.apply(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] })
      qc.invalidateQueries({ queryKey: ['rules'] })
      qc.invalidateQueries({ queryKey: ['assistant-messages'] })
    },
  })
}

export function useRevertMessage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (messageId: string) => api.assistant.revertMessage(messageId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subjects'] })
      qc.invalidateQueries({ queryKey: ['rules'] })
      qc.invalidateQueries({ queryKey: ['assistant-messages'] })
    },
  })
}
