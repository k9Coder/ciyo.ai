import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useTenant() {
  return useQuery({ queryKey: ['tenant'], queryFn: api.tenant.get, staleTime: 60_000, refetchOnMount: false })
}

export function useTenantMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['tenant'] })

  const updateName = useMutation({
    mutationFn: (name: string) => api.tenant.update(name),
    onSuccess: () => { inv(); toast('Organisation name updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const rotateOrgToken = useMutation({
    mutationFn: api.tenant.rotateOrgToken,
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const rotateAdminToken = useMutation({
    mutationFn: api.tenant.rotateAdminToken,
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const updateFailMode = useMutation({
    mutationFn: (failMode: 'open' | 'closed') => api.tenant.updateFailMode(failMode),
    onSuccess: () => { inv(); toast('Fail mode updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { updateName, rotateOrgToken, rotateAdminToken, updateFailMode }
}
