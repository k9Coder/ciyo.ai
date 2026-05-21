import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, rules, type Event } from '../db/schema.js'

export async function ingestEvent(
  tenantId: string,
  ruleId: string,
  memberId: string | null,
  data: { action: 'warn' | 'block'; siteUrl: string; matchedTerm?: string }
): Promise<Event | null> {
  const [rule] = await db.select({ reportLevel: rules.reportLevel })
    .from(rules)
    .where(eq(rules.id, ruleId))

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
