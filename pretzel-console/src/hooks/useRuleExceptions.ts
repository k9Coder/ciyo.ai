import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useRuleExceptions() {
  return useQuery({
    queryKey: ['rule-exceptions'],
    queryFn:  () => api.policy.exceptions(),
    staleTime: 5 * 60_000,
  })
}
