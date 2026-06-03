import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'
import type { Member } from '../types'

// Members page — list all members in the tenant.
export function useMembers() {
  return useQuery({ queryKey: ['members'], queryFn: api.members.list })
}

// Members page — create, update role, remove.
export function useMemberActions() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['members'] })

  const create = useMutation({
    mutationFn: (data: { email: string; displayName?: string; role?: Member['role'] }) =>
      api.members.create(data),
    onSuccess: () => { invalidate(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<{ displayName: string; role: Member['role'] }> }) =>
      api.members.update(id, data),
    onSuccess: () => { invalidate(); toast('Member updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.members.remove(id),
    onSuccess: () => { invalidate(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { create, update, remove }
}

// OrgPage (Teams section) — scoped to a specific team.
export function useTeamMemberMutations(teamId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['team-members', teamId] })

  const create = useMutation({
    mutationFn: async (data: { email: string; displayName?: string }) => {
      const member = await api.members.create(data)
      if (teamId) await api.members.assignTeam(member.id, teamId)
      return member
    },
    onSuccess: () => { invalidate(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (memberId: string) => teamId
      ? api.members.removeTeam(memberId, teamId)
      : api.members.remove(memberId),
    onSuccess: () => { invalidate(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { create, remove }
}
