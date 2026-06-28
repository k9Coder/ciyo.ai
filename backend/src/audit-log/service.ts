import { and, desc, eq, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, members, rules, subjects } from '../db/schema.js'

// DELIBERATE EXCEPTION: audit-log is a read-only reporting service. It JOINs across
// events, members, rules, and subjects to build paginated audit entries. HTTP fan-out
// is not viable here — the aggregation requires a single SQL query. This service never
// writes to foreign tables. See: docs/archive/plans/superpowers/2026-06-27-microservices-http-boundaries.md Task 23.

export interface AuditLogEntry {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  matchedTerm: string | null
  occurredAt:  string
}

export interface AuditLogPage {
  entries:    AuditLogEntry[]
  nextBefore: string | null
}

export async function getAuditLog(
  tenantId: string,
  opts: { limit: number; before?: Date; action?: 'warn' | 'block' }
): Promise<AuditLogPage> {
  const conditions = [eq(events.tenantId, tenantId)]
  if (opts.before) conditions.push(lt(events.occurredAt, opts.before))
  if (opts.action) conditions.push(eq(events.action, opts.action))

  // Fetch one extra row to detect whether another page exists.
  const rows = await db
    .select({
      id:          events.id,
      memberEmail: members.email,
      subjectName: subjects.name,
      ruleKind:    rules.kind,
      action:      events.action,
      siteUrl:     events.siteUrl,
      matchedTerm: events.matchedTerm,
      occurredAt:  events.occurredAt,
    })
    .from(events)
    .leftJoin(members,   eq(events.memberId,  members.id))
    .innerJoin(rules,    eq(events.ruleId,    rules.id))
    .innerJoin(subjects, eq(rules.subjectId,  subjects.id))
    .where(and(...conditions))
    .orderBy(desc(events.occurredAt))
    .limit(opts.limit + 1)

  const hasMore = rows.length > opts.limit
  const page    = rows.slice(0, opts.limit)

  return {
    entries: page.map(r => ({
      id:          r.id,
      memberEmail: r.memberEmail ?? null,
      subjectName: r.subjectName,
      ruleKind:    r.ruleKind,
      action:      r.action,
      siteUrl:     r.siteUrl,
      matchedTerm: r.matchedTerm ?? null,
      occurredAt:  r.occurredAt.toISOString(),
    })),
    nextBefore: hasMore ? page[page.length - 1]!.occurredAt.toISOString() : null,
  }
}
