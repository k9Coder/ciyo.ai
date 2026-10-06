import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetRedirectURL = vi.fn()
const mockLaunchWebAuthFlow = vi.fn()

vi.stubGlobal('chrome', {
  identity: {
    getRedirectURL: mockGetRedirectURL,
    launchWebAuthFlow: mockLaunchWebAuthFlow,
  },
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { signInWithDeviceAuth } = await import('@/auth/deviceAuth')

const REDIRECT_URI = 'https://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback'

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  let binary = ''
  for (const b of new Uint8Array(digest)) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetRedirectURL.mockReturnValue(REDIRECT_URI)
})

describe('signInWithDeviceAuth', () => {
  it('builds an authorize URL with a real S256 PKCE challenge, resolves the auth-flow state, and exchanges the code', async () => {
    let capturedAuthorizeUrl = ''
    mockLaunchWebAuthFlow.mockImplementation(async ({ url }: { url: string }) => {
      capturedAuthorizeUrl = url
      const state = new URL(url).searchParams.get('state')
      return `${REDIRECT_URI}?code=test-code&state=${state}`
    })
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ token: 'pd_deadbeef_' + 'x'.repeat(32), tenantId: 'tenant-1' }),
    })

    const result = await signInWithDeviceAuth()

    // launchWebAuthFlow was called interactively against our own backend's authorize endpoint.
    expect(mockLaunchWebAuthFlow).toHaveBeenCalledWith(
      expect.objectContaining({ interactive: true, url: expect.stringContaining('/auth/extension/authorize?') })
    )
    const authorizeParams = new URL(capturedAuthorizeUrl).searchParams
    expect(authorizeParams.get('client_id')).toBe('pretzel-extension')
    expect(authorizeParams.get('response_type')).toBe('code')
    expect(authorizeParams.get('code_challenge_method')).toBe('S256')
    expect(authorizeParams.get('redirect_uri')).toBe(REDIRECT_URI)

    // The token exchange must send the verifier whose SHA-256 actually matches
    // the challenge sent in the authorize step -- not just plumbing, the PKCE
    // math itself.
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/extension/token'),
      expect.objectContaining({ method: 'POST' })
    )
    const [, fetchInit] = mockFetch.mock.calls[0]!
    const body = JSON.parse(fetchInit.body as string) as { code: string; code_verifier: string; redirect_uri: string }
    expect(body.code).toBe('test-code')
    expect(body.redirect_uri).toBe(REDIRECT_URI)
    expect(await sha256Base64Url(body.code_verifier)).toBe(authorizeParams.get('code_challenge'))

    expect(result).toEqual({ token: 'pd_deadbeef_' + 'x'.repeat(32), tenantId: 'tenant-1' })
  })

  it('rejects if launchWebAuthFlow returns no result (user cancelled)', async () => {
    mockLaunchWebAuthFlow.mockResolvedValue(undefined)
    await expect(signInWithDeviceAuth()).rejects.toThrow('Sign-in was cancelled')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('rejects if the returned state does not match the one that was sent (CSRF guard)', async () => {
    mockLaunchWebAuthFlow.mockResolvedValue(`${REDIRECT_URI}?code=test-code&state=not-the-real-state`)
    await expect(signInWithDeviceAuth()).rejects.toThrow('Sign-in failed')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('surfaces the backend error message when the token exchange fails', async () => {
    mockLaunchWebAuthFlow.mockImplementation(async ({ url }: { url: string }) => {
      const state = new URL(url).searchParams.get('state')
      return `${REDIRECT_URI}?code=test-code&state=${state}`
    })
    mockFetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Invalid or expired code' }) })

    await expect(signInWithDeviceAuth()).rejects.toThrow('Invalid or expired code')
  })
})
