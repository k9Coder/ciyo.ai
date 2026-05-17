import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function usePolicy() {
  return useQuery({ queryKey: ['policy'], queryFn: api.policy.get })
}

export function usePolicyHistory() {
  return useQuery({ queryKey: ['policy-history'], queryFn: api.policy.history })
}

export function usePolicyMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const publish = useMutation({
    mutationFn: api.policy.publish,
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: ['policy'] })
      qc.invalidateQueries({ queryKey: ['policy-history'] })
      toast(`Policy published (v${version})`)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const rollback = useMutation({
    mutationFn: api.policy.rollback,
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: ['policy'] })
      qc.invalidateQueries({ queryKey: ['policy-history'] })
      toast(`Rolled back to v${version}`)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { publish, rollback }
}
