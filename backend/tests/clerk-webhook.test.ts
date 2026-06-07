import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants, members, users } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
  })),
}))

let app: FastifyInstance

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => { await truncateAll() })
afterAll(async () => { await app.close() })

function makeWebhookRequest(payload: object) {
  return supertest(app.server)
    .post('/webhooks/clerk')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
    .set('svix-signature', 'v1,test_signature')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload))
}

describe('POST /webhooks/clerk — user.created', () => {
  it('auto-provisions tenant + super_admin member when no pre-enrolled member exists', async () => {
    const res = await makeWebhookRequest({
      type: 'user.created',
      data: {
        id: 'user_new123',
        first_name: 'Alice',
        last_name: 'Chen',
        image_url: 'https://img.example.com/alice.jpg',
        email_addresses: [{ email_address: 'alice@newco.com' }],
      },
    })
    expect(res.status).toBe(200)

    const userRows = await db.select().from(users).where(eq(users.clerkId, 'user_new123'))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]!.email).toBe('alice@newco.com')
    expect(userRows[0]!.firstName).toBe('Alice')

    const memberRows = await db.select().from(members).where(eq(members.email, 'alice@newco.com'))
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0]!.role).toBe('super_admin')
    expect(memberRows[0]!.userId).toBe(userRows[0]!.id)

    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(1)
    expect(tenantRows[0]!.plan).toBe('free')
    expect(tenantRows[0]!.paymentProvider).toBeNull()
    expect(tenantRows[0]!.externalSubId).toBeNull()
  })

  it('connects a pre-enrolled member instead of auto-provisioning a new tenant', async () => {
    const { tenantId } = await buildTestTenant()
    await db.insert(members).values({ tenantId, email: 'bob@acme.com', role: 'member' })

    const res = await makeWebhookRequest({
      type: 'user.created',
      data: {
        id: 'user_bob99',
        first_name: 'Bob',
        last_name: 'Smith',
        image_url: '',
        email_addresses: [{ email_address: 'bob@acme.com' }],
      },
    })
    expect(res.status).toBe(200)

    const userRows = await db.select().from(users).where(eq(users.clerkId, 'user_bob99'))
    expect(userRows).toHaveLength(1)

    const memberRows = await db.select().from(members).where(eq(members.email, 'bob@acme.com'))
    expect(memberRows[0]!.userId).toBe(userRows[0]!.id)

    // Must NOT have created an extra tenant
    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(1)
  })
})

describe('POST /webhooks/clerk — user.updated', () => {
  it('syncs name and avatar to the users table', async () => {
    await db.insert(users).values({ clerkId: 'user_bob1', email: 'bob@acme.com' })

    const res = await makeWebhookRequest({
      type: 'user.updated',
      data: {
        id: 'user_bob1',
        first_name: 'Robert',
        last_name: 'Jones',
        image_url: 'https://example.com/bob-new.jpg',
        email_addresses: [{ email_address: 'bob@acme.com' }],
      },
    })
    expect(res.status).toBe(200)

    const rows = await db.select().from(users).where(eq(users.clerkId, 'user_bob1'))
    expect(rows[0]!.firstName).toBe('Robert')
    expect(rows[0]!.lastName).toBe('Jones')
    expect(rows[0]!.avatarUrl).toBe('https://example.com/bob-new.jpg')
  })
})

describe('POST /webhooks/clerk — user.deleted', () => {
  it('nulls clerkId on the users row', async () => {
    await db.insert(users).values({ clerkId: 'user_del1', email: 'del@acme.com' })

    const res = await makeWebhookRequest({
      type: 'user.deleted',
      data: { id: 'user_del1', deleted: true },
    })
    expect(res.status).toBe(200)

    const rows = await db.select().from(users).where(eq(users.email, 'del@acme.com'))
    expect(rows[0]!.clerkId).toBeNull()
  })
})

describe('POST /webhooks/clerk — invalid signature', () => {
  it('returns 400 when Svix signature check fails', async () => {
    const { Webhook } = await import('svix')
    ;(Webhook as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      verify: () => { throw new Error('Invalid signature') },
    }))
    const res = await makeWebhookRequest({ type: 'user.created', data: {} })
    expect(res.status).toBe(400)
  })
})
