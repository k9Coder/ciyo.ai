import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { scans, enforcementSignals, members } from '../src/db/schema.js'
import { purgeExpired, anonymizeMember, PILOT_RETENTION_DAYS } from '../src/scans/service.js'
import { deleteMember } from '../src/members/service.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
})
afterAll(async () => { await app.close() })

const daysAgo = (n: number): Date => new Date(Date.now() - n * 24 * 60 * 60 * 1000)

async function makeMember(email: string): Promise<string> {
  const user = await buildTestUser(`clerk_${email}`, email)
  const [row] = await db.insert(members).values({ tenantId, userId: user.id, email, role: 'member' }).returning({ id: members.id })
  return row!.id
}

describe('retention: purgeExpired', () => {
  it('deletes only rows older than the retention window, across both tables', async () => {
    // scans: one old (>90d), one fresh
    await db.insert(scans).values([
      { tenantId, memberId: null, occurredAt: daysAgo(PILOT_RETENTION_DAYS + 1) },
      { tenantId, memberId: null, occurredAt: daysAgo(1) },
    ])
    // enforcement_signals: one old, one fresh
    await db.insert(enforcementSignals).values([
      { tenantId, memberId: null, hostname: 'chat.openai.com', reason: 'decision_timeout', occurredAt: daysAgo(PILOT_RETENTION_DAYS + 5) },
      { tenantId, memberId: null, hostname: 'chat.openai.com', reason: 'bridge_error',     occurredAt: daysAgo(2) },
    ])

    const counts = await purgeExpired()
    expect(counts.scans).toBe(1)
    expect(counts.enforcementSignals).toBe(1)

    const remainingScans = await db.select().from(scans).where(eq(scans.tenantId, tenantId))
    expect(remainingScans).toHaveLength(1)
    const remainingSignals = await db.select().from(enforcementSignals).where(eq(enforcementSignals.tenantId, tenantId))
    expect(remainingSignals).toHaveLength(1)
  })
})

describe('retention: anonymizeMember', () => {
  it('nulls memberId on that member’s scans and enforcement_signals', async () => {
    const memberId = await makeMember('erase-me@example.com')
    const otherId  = await makeMember('keep-me@example.com')

    await db.insert(scans).values([
      { tenantId, memberId },
      { tenantId, memberId: otherId },
    ])
    await db.insert(enforcementSignals).values([
      { tenantId, memberId, hostname: 'h', reason: 'adapter_miss' },
    ])

    const counts = await anonymizeMember(memberId)
    expect(counts.scans).toBe(1)
    expect(counts.enforcementSignals).toBe(1)

    // Target member's rows are nulled; the other member's row is untouched.
    const nulledScans = await db.select().from(scans).where(and(eq(scans.tenantId, tenantId), eq(scans.memberId, otherId)))
    expect(nulledScans).toHaveLength(1)
    const targetScans = await db.select().from(scans).where(eq(scans.memberId, memberId))
    expect(targetScans).toHaveLength(0)
    const targetSignals = await db.select().from(enforcementSignals).where(eq(enforcementSignals.memberId, memberId))
    expect(targetSignals).toHaveLength(0)
  })
})

describe('retention: member deletion triggers anonymize', () => {
  it('deleting a member nulls their telemetry memberId before removing the row', async () => {
    const memberId = await makeMember('gone@example.com')
    await db.insert(scans).values({ tenantId, memberId })
    await db.insert(enforcementSignals).values({ tenantId, memberId, hostname: 'h', reason: 'decision_timeout' })

    await deleteMember(tenantId, memberId)

    // Member row gone.
    const memberRows = await db.select().from(members).where(eq(members.id, memberId))
    expect(memberRows).toHaveLength(0)

    // Telemetry rows survive but no longer reference the member.
    const scanRows = await db.select().from(scans).where(eq(scans.tenantId, tenantId))
    expect(scanRows).toHaveLength(1)
    expect(scanRows[0]!.memberId).toBeNull()
    const signalRows = await db.select().from(enforcementSignals).where(eq(enforcementSignals.tenantId, tenantId))
    expect(signalRows).toHaveLength(1)
    expect(signalRows[0]!.memberId).toBeNull()
  })
})
