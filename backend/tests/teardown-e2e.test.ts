import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { tenants, shadowVerdicts, judgeShadowChecks } from '../src/db/schema.js'
import { truncateE2eTables } from '../src/scripts/teardown-e2e.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => { await truncateAll() })
afterAll(async () => { await app.close() })

describe('teardown-e2e', () => {
  it('clears shadow telemetry tables too, so deleting tenants does not trip their foreign keys', async () => {
    const { tenantId } = await buildTestTenant()
    await db.insert(shadowVerdicts).values({ tenantId, ruleId: '11111111-1111-1111-1111-111111111111', kind: 'keyword',
      verdict: 'match', confidence: '1', occurredAt: new Date() })
    await db.insert(judgeShadowChecks).values({ tenantId, checkId: '22222222-2222-4222-8222-222222222222', surface: 'desktop',
      ruleId: '11111111-1111-4111-8111-111111111111', ruleKind: 'judge_prompt', primaryAction: 'none', secondaryVerdict: 'ok',
      messageChars: 1, windows: 0, latencyMs: 1, modelVersion: 'fast_v7+so_v7', occurredAt: new Date() })
    await truncateE2eTables()
    expect(await db.select().from(tenants)).toHaveLength(0)
    expect(await db.select().from(judgeShadowChecks)).toHaveLength(0)
    expect(await db.select().from(shadowVerdicts)).toHaveLength(0)
  })
})
