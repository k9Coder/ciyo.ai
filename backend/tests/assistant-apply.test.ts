import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { subjects, rules } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { executeActions } from '../src/assistant/apply.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  const [sub] = await db.insert(subjects).values({ tenantId, name: 'Test Subject', active: true }).returning()
  subjectId = sub!.id
})
afterAll(async () => { await app.close() })

describe('executeActions', () => {
  it('creates a keyword rule', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_rule', subjectId, kind: 'keyword', keywords: ['secret'], action: 'block' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const [rule] = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(rule?.keywords).toContain('secret')
    expect(rule?.action).toBe('block')
  })

  it('creates a subject', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_subject', name: 'New Subject' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(subjects).where(eq(subjects.tenantId, tenantId))
    expect(rows.some(s => s.name === 'New Subject')).toBe(true)
  })

  it('deletes a rule', async () => {
    const [rule] = await db.insert(rules).values({
      tenantId, subjectId, kind: 'keyword', keywords: ['x'], action: 'block', active: true, reportLevel: 'none',
    }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_rule', ruleId: rule!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const remaining = await db.select().from(rules).where(eq(rules.id, rule!.id))
    expect(remaining).toHaveLength(0)
  })

  it('records error for invalid FK and continues with remaining actions', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_rule', subjectId: '00000000-0000-0000-0000-000000000000', kind: 'keyword', keywords: ['x'], action: 'block' },
      { op: 'create_subject', name: 'Safe Subject' },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('create_rule')
    expect(applied).toHaveLength(1)
    expect(applied[0]!.op).toBe('create_subject')
  })
})
