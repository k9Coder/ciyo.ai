import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { realtimeSubscriber } from '../realtime/index'

export function usePolicyRealtime(): void {
  const qc = useQueryClient()
  const { getToken } = useAuth()

  useEffect(() => {
    return realtimeSubscriber.subscribe(
      () => getToken() as Promise<string>,
      () => {
        qc.invalidateQueries({ queryKey: ['policy'] })
        qc.invalidateQueries({ queryKey: ['policy-history'] })
        qc.invalidateQueries({ queryKey: ['subjects'] })
      }
    )
  }, [qc, getToken])
}
