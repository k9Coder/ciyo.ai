import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useBilling() {
  return useQuery({ queryKey: ['billing'], queryFn: api.billing.status, staleTime: 60_000, refetchOnMount: false })
}

export function useBillingMutations() {
  const { toast } = useToast()

  const openPortal = useMutation({
    mutationFn: (returnUrl?: string) => api.billing.stripePortal(returnUrl).then(r => { window.location.href = r.url }),
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { openPortal }
}
