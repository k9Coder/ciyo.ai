import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@clerk/react'
import { realtimeSubscriber } from '../realtime/index'

export function usePolicyRealtime(): void {
  const qc = useQueryClient()
  const { getToken } = useAuth()

  // `getToken` from Clerk is a new function reference on every render, so
  // putting it directly in the dependency array would tear down and recreate
  // the SSE connection on every render. Instead we keep the latest reference
  // in a ref and only expose the stable ref wrapper to the effect.
  const getTokenRef = useRef(getToken)
  useEffect(() => {
    getTokenRef.current = getToken
  })

  useEffect(() => {
    return realtimeSubscriber.subscribe(
      () => getTokenRef.current() as Promise<string>,
      () => {
        qc.invalidateQueries({ queryKey: ['policy'] })
        qc.invalidateQueries({ queryKey: ['policy-history'] })
        qc.invalidateQueries({ queryKey: ['subjects'] })
      }
    )
  }, [qc]) // `qc` is stable; `getToken` is accessed via ref
}
