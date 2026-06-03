import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: api.subjects.list })
}

export function useSubjectMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['subjects'] })

  const create = useMutation({
    mutationFn: api.subjects.create,
    onSuccess: () => { invalidate(); toast('Subject created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.subjects.update>[1] }) =>
      api.subjects.update(id, data),
    onSuccess: () => { invalidate(); toast('Subject updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.subjects.remove,
    onSuccess: () => { invalidate(); toast('Subject deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
