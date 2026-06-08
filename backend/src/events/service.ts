import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, rules, type Event } from '../db/schema.js'

export async function ingestEvent(
  tenantId: string,
  ruleId: string,
  memberId: string | null,
  data: { action: 'warn' | 'block'; siteUrl: string; matchedTerm?: string }
): Promise<Event | null> {
  // Filter by tenantId to prevent cross-tenant event poisoning
  const [rule] = await db.select({ reportLevel: rules.reportLevel })
    .from(rules)
    .where(and(eq(rules.id, ruleId), eq(rules.tenantId, tenantId)))

  if (!rule || rule.reportLevel === 'none') return null

  const [row] = await db.insert(events).values({
    tenantId,
    ruleId,
    action:      data.action,
    siteUrl:     data.siteUrl,
    memberId:    rule.reportLevel === 'minimal' ? null : memberId,
    matchedTerm: rule.reportLevel === 'rich' ? (data.matchedTerm ?? null) : null,
  }).returning()

  return row!
}
