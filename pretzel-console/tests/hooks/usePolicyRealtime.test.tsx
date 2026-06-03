import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

let capturedGetToken: (() => Promise<string>) | null = null
let capturedOnUpdate: (() => void) | null = null
const mockUnsub = vi.fn()

vi.mock('../../src/realtime/index', () => ({
  realtimeSubscriber: {
    subscribe: vi.fn((getToken: () => Promise<string>, onUpdate: () => void) => {
      capturedGetToken = getToken
      capturedOnUpdate = onUpdate
      return mockUnsub
    }),
  },
}))

const mockGetToken = vi.fn().mockResolvedValue('clerk-jwt')
vi.mock('@clerk/react', () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}))

import { usePolicyRealtime } from '../../src/hooks/usePolicyRealtime'
import { realtimeSubscriber } from '../../src/realtime/index'

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: new QueryClient() }, children)
}

beforeEach(() => {
  vi.clearAllMocks()
  capturedOnUpdate = null
  capturedGetToken = null
})

describe('usePolicyRealtime', () => {
  it('calls realtimeSubscriber.subscribe on mount', () => {
    renderHook(() => usePolicyRealtime(), { wrapper })
    expect(realtimeSubscriber.subscribe).toHaveBeenCalledOnce()
  })

  it('the getToken callback returns a fresh Clerk JWT', async () => {
    renderHook(() => usePolicyRealtime(), { wrapper })
    const token = await capturedGetToken?.()
    expect(token).toBe('clerk-jwt')
  })

  it('invalidates policy queries when onUpdate fires', () => {
    let qc!: QueryClient
    const w = ({ children }: { children: React.ReactNode }) => {
      qc = new QueryClient()
      vi.spyOn(qc, 'invalidateQueries')
      return React.createElement(QueryClientProvider, { client: qc }, children)
    }
    renderHook(() => usePolicyRealtime(), { wrapper: w })
    act(() => { capturedOnUpdate?.() })
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['policy'] })
    expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['policy-history'] })
  })

  it('calls unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => usePolicyRealtime(), { wrapper })
    unmount()
    expect(mockUnsub).toHaveBeenCalledOnce()
  })
})
