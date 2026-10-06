import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetToken = vi.fn()
let authState: { isLoaded: boolean; isSignedIn: boolean }

vi.mock('@clerk/react', () => ({ useAuth: () => ({ ...authState, getToken: mockGetToken }) }))

const mockSetTokenGetter = vi.fn()
vi.mock('../src/api', () => ({ setTokenGetter: (...args: unknown[]) => mockSetTokenGetter(...args) }))

import { useWireAuthToken } from '../src/hooks/useWireAuthToken'

beforeEach(() => { vi.clearAllMocks() })

describe('useWireAuthToken', () => {
  it('wires a token getter when loaded and signed in', () => {
    authState = { isLoaded: true, isSignedIn: true }
    renderHook(() => useWireAuthToken())
    expect(mockSetTokenGetter).toHaveBeenCalledWith(expect.any(Function))
  })

  it('clears the token getter when loaded and signed out', () => {
    authState = { isLoaded: true, isSignedIn: false }
    renderHook(() => useWireAuthToken())
    expect(mockSetTokenGetter).toHaveBeenCalledWith(null)
  })

  it('does nothing while Clerk has not loaded yet', () => {
    authState = { isLoaded: false, isSignedIn: false }
    renderHook(() => useWireAuthToken())
    expect(mockSetTokenGetter).not.toHaveBeenCalled()
  })

  it('does NOT clear the token getter on unmount (regression: unmount must not race a sibling mount)', () => {
    authState = { isLoaded: true, isSignedIn: true }
    const { unmount } = renderHook(() => useWireAuthToken())
    mockSetTokenGetter.mockClear()
    unmount()
    expect(mockSetTokenGetter).not.toHaveBeenCalled()
  })
})
