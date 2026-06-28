import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { startTestApp } from './helpers/setup.js'

let app: FastifyInstance

beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })

describe('internal route guard', () => {
  it('returns 404 (not 401) for /internal/* without X-Internal-Secret', async () => {
    const res = await supertest(app.server)
      .get('/internal/v1/rules')
    expect(res.status).toBe(404)
  })

  it('returns 404 for /internal/* with wrong secret', async () => {
    const res = await supertest(app.server)
      .get('/internal/v1/rules')
      .set('X-Internal-Secret', 'wrong-secret')
    expect(res.status).toBe(404)
  })

  it('returns 404 for /internal/* with empty secret', async () => {
    const res = await supertest(app.server)
      .get('/internal/v1/rules')
      .set('X-Internal-Secret', '')
    expect(res.status).toBe(404)
  })
})
