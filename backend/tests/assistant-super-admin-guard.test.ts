import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { members } from '../src/db/schema.js'
import { executeActions, type ApplyContext } from '../src/assistant/apply.js'
import { requestContext } from '../src/context/request-context.js'
import type { Action } from '../src/assistant/llm/interface.js'
import type { FastifyInstance } from 'fastify'

// executeActions calls the internal HTTP client, which reads tenantId from the
// request context — run each call inside one so those headers are populated.
function runApply(actions: Action[], ctx: ApplyContext) {
  return requestContext.run(
    { traceId: 'test-guard', tenantId, isM2M: true },
    () => executeActions(tenantId, actions, ctx),
  )
}

let app: FastifyInstance
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
})
afterAll(async () => { await app.close() })

const superAdminAction: Action = { op: 'create_member', email: 'root@example.com', role: 'super_admin' }

describe('assistant super_admin guard', () => {
  it('rejects create_member{role:super_admin} when caller is not super_admin', async () => {
    const { applied, errors } = await runApply([superAdminAction], { callerRole: 'division_admin' })
    expect(applied).toHaveLength(0)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0]).toMatch(/super_admin/)

    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    expect(rows.some(m => m.email === 'root@example.com')).toBe(false)
  })

  it('allows create_member{role:super_admin} when caller IS super_admin', async () => {
    const { applied, errors } = await runApply([superAdminAction], { callerRole: 'super_admin' })
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)

    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    expect(rows.some(m => m.email === 'root@example.com' && m.role === 'super_admin')).toBe(true)
  })

  it('allows a non-super_admin caller to create an ordinary member (guard is scoped)', async () => {
    const action: Action = { op: 'create_member', email: 'staff@example.com', role: 'member' }
    const { applied, errors } = await runApply([action], { callerRole: 'division_admin' })
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
  })
})
