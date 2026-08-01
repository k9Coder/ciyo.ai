import { describe, it, expect, vi, beforeEach } from 'vitest'
import { installClerkSessionRecovery } from '../src/lib/clerkSessionRecovery'

const assign = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'location', {
    value: { assign, pathname: '/onboarding' }, writable: true,
  })
})

function dispatchRejection(reason: unknown) {
  const event = new Event('unhandledrejection', { cancelable: true }) as PromiseRejectionEvent
  Object.defineProperty(event, 'reason', { value: reason })
  window.dispatchEvent(event)
  return event
}

describe('installClerkSessionRecovery', () => {
  it('redirects to /login on a stale Clerk session touch() 404', () => {
    installClerkSessionRecovery()

    const event = dispatchRejection(new Error('No session was found with id sess_abc123'))

    expect(event.defaultPrevented).toBe(true)
    expect(assign).toHaveBeenCalledWith('/login')
  })

  it('does not redirect for unrelated rejections', () => {
    installClerkSessionRecovery()

    const event = dispatchRejection(new Error('Network request failed'))

    expect(event.defaultPrevented).toBe(false)
    expect(assign).not.toHaveBeenCalled()
  })

  it('does not re-redirect when already on /login', () => {
    Object.defineProperty(window, 'location', {
      value: { assign, pathname: '/login' }, writable: true,
    })
    installClerkSessionRecovery()

    dispatchRejection(new Error('No session was found with id sess_abc123'))

    expect(assign).not.toHaveBeenCalled()
  })
})
