import { API_BASE } from '../lib/api'
import type { IRealtimeSubscriber } from './types'

export class SSESubscriber implements IRealtimeSubscriber {
  subscribe(getToken: () => Promise<string>, onUpdate: () => void): () => void {
    let es: EventSource | null = null
    let closed = false

    const connect = async () => {
      const token = await getToken()
      es = new EventSource(`${API_BASE}/v1/events?token=${token}`)

      es.addEventListener('message', onUpdate)

      es.addEventListener('error', async () => {
        // readyState === 2 means the server responded with non-2xx (e.g. token expired).
        // readyState === 0 means it's reconnecting automatically — leave it alone.
        if (es?.readyState === EventSource.CLOSED && !closed) {
          es.close()
          await new Promise(r => setTimeout(r, 1000))
          connect()
        }
      })
    }

    connect()

    return () => {
      closed = true
      es?.close()
    }
  }
}
