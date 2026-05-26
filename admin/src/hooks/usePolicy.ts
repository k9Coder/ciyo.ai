import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { AdminApiError } from '../api'
import { useToast } from './useToast'
import type { PolicyInfo } from '../types'

async function fetchPolicy(): Promise<PolicyInfo | null> {
  try { return await api.policy.get() }
  catch (e) { if (e instanceof AdminApiError && e.status === 404) return null; throw e }
}

export function usePolicy() {
  return useQuery({ queryKey: ['policy'], queryFn: fetchPolicy, staleTime: 60_000, refetchOnMount: false })
}

export function usePolicyHistory() {
  return useQuery({ queryKey: ['policy-history'], queryFn: api.policy.history, staleTime: 60_000, refetchOnMount: false })
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
