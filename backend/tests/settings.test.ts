import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { parseToken, compareToken } from '../src/auth/tokens.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let adminToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken
})
afterAll(async () => { await app.close() })

describe('PATCH /v1/tenant', () => {
  it('updates the name', async () => {
    const res = await supertest(app.server)
      .patch('/v1/tenant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Firm Name' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Firm Name')
    const [row] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.name).toBe('New Firm Name')
  })

  it('returns 400 when name is missing', async () => {
    const res = await supertest(app.server)
      .patch('/v1/tenant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).patch('/v1/tenant').send({ name: 'x' })
    expect(res.status).toBe(401)
  })
})

describe('POST /v1/tenant/rotate-org-token', () => {
  it('returns a new org token and invalidates the old one', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenant/rotate-org-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token).toMatch(/^ps_live_/)

    const parsed = parseToken(res.body.token)
    expect(parsed).not.toBeNull()
    expect(parsed!.prefix).toBe('ps_live')

    const [row] = await db.select({ orgTokenHash: tenants.orgTokenHash }).from(tenants).where(eq(tenants.id, tenantId))
    expect(await compareToken(parsed!.secret, row!.orgTokenHash)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/tenant/rotate-org-token').send()
    expect(res.status).toBe(401)
  })
})

describe('POST /v1/tenant/rotate-admin-token', () => {
  it('returns a new admin token', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenant/rotate-admin-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.token).toMatch(/^ps_adm_/)

    const parsed = parseToken(res.body.token)
    expect(parsed!.prefix).toBe('ps_adm')

    const [row] = await db.select({ adminTokenHash: tenants.adminTokenHash }).from(tenants).where(eq(tenants.id, tenantId))
    expect(await compareToken(parsed!.secret, row!.adminTokenHash)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/tenant/rotate-admin-token').send()
    expect(res.status).toBe(401)
  })
})
