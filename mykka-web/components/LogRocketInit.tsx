'use client'

import { useEffect } from 'react'
import { env } from '@/lib/env'

export function LogRocketInit() {
  useEffect(() => {
    const id = env.NEXT_PUBLIC_LOGROCKET_ID
    if (!id) return
    import('logrocket').then(({ default: LogRocket }) => {
      LogRocket.init(id)
    })
  }, [])

  return null
}
