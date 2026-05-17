import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useMemberMutations(teamId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['team-members', teamId] })

  const create = useMutation({
    mutationFn: async (data: { email: string; displayName?: string }) => {
      const member = await api.members.create(data)
      if (teamId) await api.members.assignTeam(member.id, teamId)
      return member
    },
    onSuccess: () => { inv(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: (memberId: string) => teamId
      ? api.members.removeTeam(memberId, teamId)
      : api.members.remove(memberId),
    onSuccess: () => { inv(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, remove }
}
