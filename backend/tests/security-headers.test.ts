import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { startTestApp } from './helpers/setup.js'

let app: FastifyInstance
beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })

describe('S5: security headers (helmet)', () => {
  it('sets nosniff, frameguard, HSTS and referrer-policy', async () => {
    const res = await supertest(app.server).get('/health')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-frame-options']).toBeDefined()
    expect(res.headers['strict-transport-security']).toContain('max-age=')
    expect(res.headers['referrer-policy']).toBeDefined()
  })

  it('relaxes cross-origin-resource-policy so cross-origin clients are not blocked', async () => {
    const res = await supertest(app.server).get('/health')
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin')
  })
})
