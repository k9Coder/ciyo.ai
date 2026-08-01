import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { getSelectedTenantId } from '../lib/tenant'

export function useMemberships() {
  return useQuery({
    queryKey: ['memberships'],
    queryFn: () => api.me.memberships().then(r => r.memberships),
    staleTime: 60_000,
    refetchOnMount: false,
  })
}

/** The currently-selected tenant's membership, or the sole one if there's only one. */
export function useActiveOrg() {
  const { data: memberships } = useMemberships()
  const selected = getSelectedTenantId()
  return memberships?.find(m => m.tenantId === selected) ?? memberships?.[0]
}
