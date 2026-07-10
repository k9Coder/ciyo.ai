import { describe, it, expect, afterEach } from 'vitest'
import supertest from 'supertest'
import { buildApp } from '../src/app.js'

// Rate limiting is keyed by X-Tenant-Id (or IP) and applies to /v1/* routes. The
// limiter's onRequest check runs before auth, so an unauthenticated route still
// returns 429 once the key exceeds its budget (we probe /v1/events, which 401s
// under the limit and 429s over it). /health is explicitly allow-listed.
describe('S2: rate limiting', () => {
  const saved = { ...process.env }
  afterEach(() => { process.env = { ...saved } })

  it('returns 429 once the per-key limit is exceeded', async () => {
    process.env.RATE_LIMIT_DISABLED = 'false'
    process.env.RATE_LIMIT_MAX = '2'
    const app = buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const agent = supertest(app.server)
      const post = () => agent.post('/v1/events').set('X-Tenant-Id', 'ratelimit-test-key').send({})
      expect((await post()).status).not.toBe(429)
      expect((await post()).status).not.toBe(429)
      expect((await post()).status).toBe(429)
    } finally {
      await app.close()
    }
  })

  it('never throttles /health (allow-listed for uptime monitors)', async () => {
    process.env.RATE_LIMIT_DISABLED = 'false'
    process.env.RATE_LIMIT_MAX = '1'
    const app = buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const agent = supertest(app.server)
      for (let i = 0; i < 4; i++) {
        expect((await agent.get('/health')).status).toBe(200)
      }
    } finally {
      await app.close()
    }
  })

  it('does not throttle when RATE_LIMIT_DISABLED=true', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true'
    process.env.RATE_LIMIT_MAX = '1'
    const app = buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    try {
      const agent = supertest(app.server)
      for (let i = 0; i < 4; i++) {
        expect((await agent.post('/v1/events').set('X-Tenant-Id', 'k').send({})).status).not.toBe(429)
      }
    } finally {
      await app.close()
    }
  })
})
