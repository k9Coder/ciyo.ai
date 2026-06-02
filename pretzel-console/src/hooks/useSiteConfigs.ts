import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useSiteConfigs() {
  return useQuery({ queryKey: ['site-configs'], queryFn: api.siteConfigs.list })
}

export function useSiteConfigMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['site-configs'] })

  const create = useMutation({
    mutationFn: api.siteConfigs.create,
    onSuccess: () => { inv(); toast('Site config created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ domain, data }: { domain: string; data: Parameters<typeof api.siteConfigs.update>[1] }) =>
      api.siteConfigs.update(domain, data),
    onSuccess: () => { inv(); toast('Site config updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.siteConfigs.remove,
    onSuccess: () => { inv(); toast('Site config deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
