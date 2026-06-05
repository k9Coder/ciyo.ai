import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { subjects, rules, divisions, teams, members, memberTeams } from '../src/db/schema.js'
import { eq, and } from 'drizzle-orm'
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

  // --- divisions ---

  it('creates a division', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_division', name: 'Legal' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(divisions).where(eq(divisions.tenantId, tenantId))
    expect(rows.some(d => d.name === 'Legal')).toBe(true)
    expect(rows.find(d => d.name === 'Legal')?.slug).toBe('legal')
  })

  it('creates a division and auto-slugifies the name', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_division', name: 'Research & Development' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(divisions).where(eq(divisions.tenantId, tenantId))
    expect(rows.find(d => d.name === 'Research & Development')?.slug).toBe('research-development')
  })

  it('deletes a division', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'ToDelete', slug: 'todelete' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_division', divisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(divisions).where(eq(divisions.id, div!.id))
    expect(rows).toHaveLength(0)
  })

  // --- teams ---

  it('creates a team inside a division', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_team', name: 'Backend', divisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(teams).where(eq(teams.tenantId, tenantId))
    expect(rows.some(t => t.name === 'Backend')).toBe(true)
    expect(rows.find(t => t.name === 'Backend')?.slug).toBe('backend')
  })

  it('deletes a team', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Backend', slug: 'backend' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_team', teamId: team!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(teams).where(eq(teams.id, team!.id))
    expect(rows).toHaveLength(0)
  })

  // --- members ---

  it('creates a member', async () => {
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_member', email: 'jane@example.com', role: 'member' },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    expect(rows.some(m => m.email === 'jane@example.com')).toBe(true)
  })

  it('creates a division_admin member and sets adminDivisionId', async () => {
    const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'create_member', email: 'admin@example.com', role: 'division_admin', adminDivisionId: div!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.tenantId, tenantId))
    const created = rows.find(m => m.email === 'admin@example.com')
    expect(created?.role).toBe('division_admin')
    expect(created?.adminDivisionId).toBe(div!.id)
  })

  it('deletes a member', async () => {
    const [mem] = await db.insert(members).values({ tenantId, email: 'del@example.com', role: 'member' }).returning()
    const { applied, errors } = await executeActions(tenantId, [
      { op: 'delete_member', memberId: mem!.id },
    ])
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const rows = await db.select().from(members).where(eq(members.id, mem!.id))
    expect(rows).toHaveLength(0)
  })

  it('assigns and removes a member from a team', async () => {
    const [div]  = await db.insert(divisions).values({ tenantId, name: 'Eng', slug: 'eng' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Backend', slug: 'backend' }).returning()
    const [mem]  = await db.insert(members).values({ tenantId, email: 'dev@example.com', role: 'member' }).returning()

    const assign = await executeActions(tenantId, [
      { op: 'assign_member_team', memberId: mem!.id, teamId: team!.id },
    ])
    expect(assign.errors).toHaveLength(0)
    const afterAssign = await db.select().from(memberTeams)
      .where(and(eq(memberTeams.memberId, mem!.id), eq(memberTeams.teamId, team!.id)))
    expect(afterAssign).toHaveLength(1)

    const remove = await executeActions(tenantId, [
      { op: 'remove_member_team', memberId: mem!.id, teamId: team!.id },
    ])
    expect(remove.errors).toHaveLength(0)
    const afterRemove = await db.select().from(memberTeams)
      .where(and(eq(memberTeams.memberId, mem!.id), eq(memberTeams.teamId, team!.id)))
    expect(afterRemove).toHaveLength(0)
  })
})
