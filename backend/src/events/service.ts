import { db } from '../db/client.js'
import { events, type Event } from '../db/schema.js'
import { rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

export async function ingestEvent(
  tenantId: string,
  ruleId: string,
  memberId: string | null,
  data: { action: 'warn' | 'block'; siteUrl: string; matchedTerm?: string }
): Promise<Event | null> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const rule = await rulesClient.get<{ reportLevel: string }>(`/${ruleId}`)
    .then(r => r.data)
    .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })

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
