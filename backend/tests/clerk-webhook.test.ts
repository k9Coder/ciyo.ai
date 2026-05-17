import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants, members } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
  })),
}))

let app: FastifyInstance
let tenantId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const result = await buildTestTenant()
  tenantId = result.tenantId
  await db.update(tenants).set({ clerkOrgId: 'org_test123' }).where(eq(tenants.id, tenantId))
})
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

describe('POST /webhooks/clerk', () => {
  it('organization.created creates a new tenant', async () => {
    await truncateAll()
    const res = await makeWebhookRequest({
      type: 'organization.created',
      data: { id: 'org_new999', name: 'New Law Firm', slug: 'new-law-firm', created_by: 'user_admin1' },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(tenants).where(eq(tenants.clerkOrgId, 'org_new999'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('New Law Firm')
  })

  it('organizationMembership.created creates a member row', async () => {
    const res = await makeWebhookRequest({
      type: 'organizationMembership.created',
      data: {
        organization: { id: 'org_test123' },
        public_user_data: {
          user_id: 'user_alice1',
          first_name: 'Alice',
          last_name: 'Smith',
          image_url: 'https://example.com/alice.jpg',
          identifier: 'alice@acme.com',
        },
        role: 'org:member',
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_alice1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('alice@acme.com')
    expect(rows[0]!.firstName).toBe('Alice')
  })

  it('user.updated syncs name and avatar to member row', async () => {
    await db.insert(members).values({
      tenantId, email: 'bob@acme.com', clerkId: 'user_bob1', firstName: 'Bobby', role: 'member',
    })
    const res = await makeWebhookRequest({
      type: 'user.updated',
      data: {
        id: 'user_bob1',
        first_name: 'Robert',
        last_name: 'Jones',
        image_url: 'https://example.com/bob.jpg',
        email_addresses: [{ email_address: 'bob@acme.com', id: 'idn_1' }],
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_bob1'))
    expect(rows[0]!.firstName).toBe('Robert')
    expect(rows[0]!.lastName).toBe('Jones')
  })

  it('organizationMembership.deleted removes the member row', async () => {
    await db.insert(members).values({
      tenantId, email: 'del@acme.com', clerkId: 'user_del1', role: 'member',
    })
    const res = await makeWebhookRequest({
      type: 'organizationMembership.deleted',
      data: {
        organization: { id: 'org_test123' },
        public_user_data: { user_id: 'user_del1', identifier: 'del@acme.com' },
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_del1'))
    expect(rows).toHaveLength(0)
  })

  it('returns 400 when Svix signature is invalid', async () => {
    const { Webhook } = await import('svix')
    vi.mocked((Webhook as ReturnType<typeof vi.fn>).mock.results[0]!.value.verify).mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })
    const res = await makeWebhookRequest({ type: 'organization.created', data: {} })
    expect(res.status).toBe(400)
  })
})
