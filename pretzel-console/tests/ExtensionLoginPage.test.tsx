import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), useClerk: vi.fn() }))

import { useAuth, useClerk } from '@clerk/react'
import { ExtensionLoginPage } from '../src/pages/ExtensionLoginPage'

const QS = 'state=st1&code_challenge=cc1&redirect_uri=' + encodeURIComponent('https://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback')

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/extension-login?${QS}`]}>
      <ExtensionLoginPage />
    </MemoryRouter>
  )
}

const mockGetToken = vi.fn()
const mockOpenSignIn = vi.fn()
const originalFetch = global.fetch
const originalLocation = window.location

beforeEach(() => {
  vi.clearAllMocks()
  mockGetToken.mockResolvedValue('clerk_jwt_abc')
  vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, getToken: mockGetToken } as any)
  vi.mocked(useClerk).mockReturnValue({ openSignIn: mockOpenSignIn } as any)
  delete (window as any).location
  ;(window as any).location = { ...originalLocation, href: '' }
})

afterEach(() => {
  global.fetch = originalFetch
  ;(window as any).location = originalLocation
})

describe('ExtensionLoginPage', () => {
  it('completes the handoff and redirects to the chromiumapp.org callback URL', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ redirectUrl: 'https://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback?code=abc&state=st1' }),
    }) as any

    renderPage()

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/extension/authorize/complete'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer clerk_jwt_abc' }),
      })
    ))
    await waitFor(() => expect(window.location.href).toBe('https://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback?code=abc&state=st1'))
  })

  it('shows the backend error message when authorize/complete fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'redirect_uri must be a chromiumapp.org URL' }),
    }) as any

    renderPage()

    expect(await screen.findByText('redirect_uri must be a chromiumapp.org URL')).toBeInTheDocument()
  })

  it('opens Clerk sign-in when the user is not yet signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, getToken: mockGetToken } as any)
    renderPage()
    expect(mockOpenSignIn).toHaveBeenCalled()
  })
})
