import { afterEach, describe, expect, it, vi } from 'vitest'

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults NEXT_PUBLIC_APP_URL to the production app origin when unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined)
    const { env } = await import('./env')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://app.mykka.ai')
  })

  it('uses the provided NEXT_PUBLIC_APP_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:5173')
    const { env } = await import('./env')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:5173')
  })
})
