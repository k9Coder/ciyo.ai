import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useTeams(divisionId: string | null) {
  return useQuery({
    queryKey: ['teams', divisionId],
    queryFn: () => api.teams.list(divisionId!),
    enabled: !!divisionId,
  })
}

export function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => api.teams.members(teamId!),
    enabled: !!teamId,
  })
}

export function useTeamMutations(divisionId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['teams', divisionId] })

  const create = useMutation({
    mutationFn: (name: string) => api.teams.create(divisionId!, name),
    onSuccess: () => { inv(); toast('Team created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.teams.update(id, name),
    onSuccess: () => { inv(); toast('Team updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.teams.remove,
    onSuccess: () => { inv(); toast('Team deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
