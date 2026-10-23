import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import type { FastifyInstance } from 'fastify'

// The auth middleware caches tenant rows for 30s and GET /tenant answers from
// that cache. Finishing onboarding must invalidate it, or the console reads the
// stale onboardingWizardCompleted=false and loops back into the wizard.

let app: FastifyInstance
let adminToken: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  ;({ adminToken } = await buildTestTenant())
})
afterAll(async () => { await app.close() })

async function wizardCompleted(): Promise<boolean> {
  const res = await supertest(app.server).get('/v1/tenant').set('Authorization', `Bearer ${adminToken}`)
  expect(res.status).toBe(200)
  return res.body.onboardingWizardCompleted
}

describe('onboarding invalidates the cached tenant', () => {
  it('GET /tenant reports completed right after POST /onboarding/skip', async () => {
    expect(await wizardCompleted()).toBe(false) // primes the cache
    const res = await supertest(app.server).post('/v1/onboarding/skip').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(await wizardCompleted()).toBe(true)
  })

  it('GET /tenant reports completed right after POST /onboarding/apply-template', async () => {
    expect(await wizardCompleted()).toBe(false) // primes the cache
    const res = await supertest(app.server)
      .post('/v1/onboarding/apply-template')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ profession: 'other', followUpAnswer: '' })
    expect(res.status).toBe(200)
    expect(await wizardCompleted()).toBe(true)
  })
})
