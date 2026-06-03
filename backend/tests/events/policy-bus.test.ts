import { describe, it, expect } from 'vitest'

describe('policyBus', () => {
  it('emits and receives policy:updated events', async () => {
    const { policyBus, policyUpdatedEvent } = await import('../../src/events/policy-bus.js')
    const received: string[] = []
    policyBus.on(policyUpdatedEvent('tenant-1'), () => received.push('tenant-1'))
    policyBus.emit(policyUpdatedEvent('tenant-1'))
    expect(received).toEqual(['tenant-1'])
  })

  it('does not cross-emit to different tenants', async () => {
    const { policyBus, policyUpdatedEvent } = await import('../../src/events/policy-bus.js')
    const received: string[] = []
    policyBus.on(policyUpdatedEvent('tenant-A'), () => received.push('A'))
    policyBus.emit(policyUpdatedEvent('tenant-B'))
    expect(received).toHaveLength(0)
  })
})
