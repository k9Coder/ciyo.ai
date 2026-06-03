import { EventEmitter } from 'events'

const bus = new EventEmitter()
bus.setMaxListeners(1000)

export const policyBus = bus
export const policyUpdatedEvent = (tenantId: string) => `policy:updated:${tenantId}`
