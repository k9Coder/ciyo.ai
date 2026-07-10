import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import type { FastifyInstance } from 'fastify'
import { startTestApp } from './helpers/setup.js'
import { truncateAll, buildTestTenant } from './helpers/db.js'

let app: FastifyInstance
let orgToken: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant('events')
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('S6: POST /v1/events input validation', () => {
  const post = (body: unknown) =>
    supertest(app.server).post('/v1/events').set('Authorization', `Bearer ${orgToken}`).send(body as object)

  it('rejects an invalid action', async () => {
    const res = await post({ ruleId: 'r1', action: 'nuke', siteUrl: 'https://chatgpt.com' })
    expect(res.status).toBe(400)
  })

  it('rejects an oversized siteUrl', async () => {
    const res = await post({ ruleId: 'r1', action: 'block', siteUrl: 'https://x.com/' + 'a'.repeat(3000) })
    expect(res.status).toBe(400)
  })

  it('rejects an oversized ruleId', async () => {
    const res = await post({ ruleId: 'r'.repeat(300), action: 'block', siteUrl: 'https://chatgpt.com' })
    expect(res.status).toBe(400)
  })

  it('accepts a well-formed event (rule missing -> 204, not a validation error)', async () => {
    const res = await post({ ruleId: 'r-nonexistent', action: 'block', siteUrl: 'https://chatgpt.com', matchedTerm: 'x'.repeat(1000) })
    expect(res.status).not.toBe(400)
  })
})
