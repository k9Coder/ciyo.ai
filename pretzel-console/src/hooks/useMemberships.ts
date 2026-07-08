import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useMemberships() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: () => api.me.memberships().then(r => r.memberships),
    staleTime: 60_000,
    refetchOnMount: false,
  })
}
