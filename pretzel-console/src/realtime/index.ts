import { SSESubscriber } from './sse.adapter'
import type { IRealtimeSubscriber } from './types'

export const realtimeSubscriber: IRealtimeSubscriber = new SSESubscriber()
export type { IRealtimeSubscriber }
