import { afterEach, describe, expect, it, vi } from 'vitest'
import { withScheme } from './env'

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('defaults NEXT_PUBLIC_APP_URL to the production app origin when unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', undefined)
    const { env } = await import('./env')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://pretzel-console.mykka.ai')
  })

  it('uses the provided NEXT_PUBLIC_APP_URL when set', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:5173')
    const { env } = await import('./env')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://localhost:5173')
  })

  it('adds https:// when NEXT_PUBLIC_APP_URL has no scheme, so links do not become paths on this site', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'pretzel-console.mykka.ai')
    const { env } = await import('./env')
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://pretzel-console.mykka.ai')
  })
})

describe('withScheme', () => {
  it('keeps a full origin and drops trailing slashes and spaces', () => {
    expect(withScheme('https://pretzel-console.mykka.ai/')).toBe('https://pretzel-console.mykka.ai')
    expect(withScheme(' http://localhost:5173 ')).toBe('http://localhost:5173')
  })

  it('prefixes a bare host', () => {
    expect(withScheme('staging-console.mykka.ai')).toBe('https://staging-console.mykka.ai')
  })
})
