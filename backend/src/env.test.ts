import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vitest loads backend/.env.test (see vitest.config.ts `env:`), so required
// vars are present by default; individual tests knock them out via stubEnv.
describe('env', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('parses a valid environment with defaults applied', async () => {
    const { env } = await import('./env.js')
    expect(env.DATABASE_URL).toContain('postgres')
    expect(env.PORT).toBe(3000)
    expect(env.NODE_ENV).toBe('test')
  })

  it('throws naming the missing required var', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '')
    await expect(import('./env.js')).rejects.toThrow(/CLERK_SECRET_KEY/)
  })

  it('coerces numeric vars', async () => {
    vi.stubEnv('PORT', '8080')
    const { env } = await import('./env.js')
    expect(env.PORT).toBe(8080)
  })
})
