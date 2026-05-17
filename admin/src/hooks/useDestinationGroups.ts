import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useDestinationGroups() {
  return useQuery({ queryKey: ['destination-groups'], queryFn: api.destinationGroups.list })
}

export function useDestinationGroupMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['destination-groups'] })

  const create = useMutation({
    mutationFn: api.destinationGroups.create,
    onSuccess: () => { inv(); toast('Group created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.destinationGroups.update>[1] }) =>
      api.destinationGroups.update(id, data),
    onSuccess: () => { inv(); toast('Group updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.destinationGroups.remove,
    onSuccess: () => { inv(); toast('Group deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
