'use client'

import { useEffect } from 'react'
import { env } from '@/lib/env'

export function LogRocketInit() {
  useEffect(() => {
    const id = env.NEXT_PUBLIC_LOGROCKET_ID
    if (!id) return

    const load = () => {
      import('logrocket').then(({ default: LogRocket }) => {
        LogRocket.init(id)
      })
    }

    // Defer off the initial-render critical path — LogRocket's ~140KB parse/exec
    // cost otherwise competes with hero hydration for main-thread time.
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(load, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = setTimeout(load, 2000)
    return () => clearTimeout(timer)
  }, [])

  return null
}
