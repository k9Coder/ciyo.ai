import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

/** Degraded-enforcement summary for the "protection degraded" banner (B2 Layer 2). */
export function useEnforcementHealth() {
  return useQuery({
    queryKey:            ['telemetry', 'enforcement-summary'],
    queryFn:             api.telemetry.enforcementSummary,
    staleTime:           60_000,
    refetchInterval:     120_000,
    refetchOnMount:      false,
    refetchOnWindowFocus: false,
  })
}
