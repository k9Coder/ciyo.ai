import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useDivisions() {
  return useQuery({ queryKey: ['divisions'], queryFn: api.divisions.list })
}

export function useDivisionMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['divisions'] })

  const create = useMutation({
    mutationFn: (name: string) => api.divisions.create(name),
    onSuccess: () => { invalidate(); toast('Division created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.divisions.update(id, name),
    onSuccess: () => { invalidate(); toast('Division updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.divisions.remove,
    onSuccess: () => { invalidate(); toast('Division deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
