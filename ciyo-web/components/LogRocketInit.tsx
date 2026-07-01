'use client'

import { useEffect } from 'react'

export function LogRocketInit() {
  useEffect(() => {
    const id = process.env['NEXT_PUBLIC_LOGROCKET_ID']
    if (!id) return
    import('logrocket').then(({ default: LogRocket }) => {
      LogRocket.init(id)
    })
  }, [])

  return null
}
