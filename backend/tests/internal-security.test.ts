import { describe, it, expect, afterEach } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../src/app.js'
import { startTestApp } from './helpers/setup.js'

describe('S1: INTERNAL_SECRET boot guard', () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  it('throws in production when INTERNAL_SECRET is unset', () => {
    process.env.NODE_ENV = 'production'
    process.env.CORS_ORIGIN = 'https://console.ciyo.ai'
    delete process.env.INTERNAL_SECRET
    expect(() => buildApp()).toThrow(/INTERNAL_SECRET/)
  })

  it('throws in production when INTERNAL_SECRET is shorter than 32 chars', () => {
    process.env.NODE_ENV = 'production'
    process.env.CORS_ORIGIN = 'https://console.ciyo.ai'
    process.env.INTERNAL_SECRET = 'too-short'
    expect(() => buildApp()).toThrow(/INTERNAL_SECRET/)
  })

  it('does not throw in production when INTERNAL_SECRET is >=32 chars', () => {
    process.env.NODE_ENV = 'production'
    process.env.CORS_ORIGIN = 'https://console.ciyo.ai'
    process.env.INTERNAL_SECRET = 'a'.repeat(32)
    expect(() => buildApp()).not.toThrow()
  })
})

describe('S1: internal guard accepts the correct secret', () => {
  it('does not 404 when a valid X-Internal-Secret is presented', async () => {
    const { app } = await startTestApp()
    try {
      const res = await supertest(app.server)
        .get('/internal/v1/rules')
        .set('X-Internal-Secret', process.env.INTERNAL_SECRET ?? '')
        .set('X-Tenant-ID', '00000000-0000-0000-0000-000000000000')
      // Guard passed → route handled it (may 200/400/500), just not the 404 the guard returns.
      expect(res.status).not.toBe(404)
    } finally {
      await app.close()
    }
  })
})
