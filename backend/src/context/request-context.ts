import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  traceId:      string
  tenantId?:    string
  initiatorId?: string
  isM2M:        boolean
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
export const getContext = (): RequestContext | undefined => requestContext.getStore()
