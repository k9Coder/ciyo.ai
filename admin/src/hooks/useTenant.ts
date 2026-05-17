import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useTenant() {
  return useQuery({ queryKey: ['tenant'], queryFn: api.tenant.get })
}
