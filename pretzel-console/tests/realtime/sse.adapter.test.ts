import { describe, it, expect, vi, beforeEach } from 'vitest'

class MockEventSource {
  static instances: MockEventSource[] = []
  static CLOSED = 2
  listeners: Record<string, Array<() => void>> = {}
  readyState = 1
  url: string
  constructor(url: string) { this.url = url; MockEventSource.instances.push(this) }
  addEventListener(type: string, fn: () => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), fn]
  }
  close() { this.readyState = 2 }
  _trigger(type: string) { this.listeners[type]?.forEach(fn => fn()) }
  _triggerError(closed = false) {
    this.readyState = closed ? 2 : 0
    this.listeners['error']?.forEach(fn => fn())
  }
}

vi.stubGlobal('EventSource', MockEventSource)
vi.mock('../../src/lib/api', () => ({ API_BASE: 'https://api.test' }))

import { SSESubscriber } from '../../src/realtime/sse.adapter'

beforeEach(() => { MockEventSource.instances = [] })

describe('SSESubscriber', () => {
  it('opens EventSource at /v1/events?token=xxx', async () => {
    new SSESubscriber().subscribe(async () => 'my-token', vi.fn())
    await new Promise(r => setTimeout(r, 0))
    expect(MockEventSource.instances[0].url).toBe('https://api.test/v1/events?token=my-token')
  })

  it('calls onUpdate when server sends a message event', async () => {
    const onUpdate = vi.fn()
    new SSESubscriber().subscribe(async () => 'tok', onUpdate)
    await new Promise(r => setTimeout(r, 0))
    MockEventSource.instances[0]._trigger('message')
    expect(onUpdate).toHaveBeenCalledOnce()
  })

  it('closes EventSource on unsubscribe', async () => {
    const unsub = new SSESubscriber().subscribe(async () => 'tok', vi.fn())
    await new Promise(r => setTimeout(r, 0))
    unsub()
    expect(MockEventSource.instances[0].readyState).toBe(2)
  })

  it('reconnects with a fresh token when EventSource closes with 401', async () => {
    const getToken = vi.fn().mockResolvedValue('fresh-token')
    new SSESubscriber().subscribe(getToken, vi.fn())
    await new Promise(r => setTimeout(r, 0))

    MockEventSource.instances[0]._triggerError(true)
    await new Promise(r => setTimeout(r, 1100))

    expect(MockEventSource.instances).toHaveLength(2)
    expect(MockEventSource.instances[1].url).toContain('fresh-token')
  })
})
