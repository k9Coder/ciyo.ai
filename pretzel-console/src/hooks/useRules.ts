import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useRules(subjectId: string | null) {
  return useQuery({
    queryKey: ['rules', subjectId],
    queryFn: () => api.rules.list(subjectId!),
    enabled: !!subjectId,
  })
}

export function useRuleMutations(subjectId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['rules', subjectId] })

  const create = useMutation({
    mutationFn: (data: Parameters<typeof api.rules.create>[1]) => api.rules.create(subjectId!, data),
    onSuccess: () => { invalidate(); toast('Rule created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.rules.update>[1] }) =>
      api.rules.update(id, data),
    onSuccess: () => { invalidate(); toast('Rule updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.rules.remove,
    onSuccess: () => { invalidate(); toast('Rule deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
