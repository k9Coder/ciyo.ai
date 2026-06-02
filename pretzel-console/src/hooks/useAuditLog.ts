import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useAuditLog(action?: 'warn' | 'block') {
  return useInfiniteQuery({
    queryKey:         ['audit-log', action],
    queryFn:          ({ pageParam }) =>
      api.auditLog.list({ limit: 50, before: pageParam as string | undefined, action }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextBefore ?? undefined,
    staleTime:        5 * 60_000,
  })
}
