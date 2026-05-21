import { and, eq, gte, isNotNull, sql, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, scans, members, rules, subjects } from '../db/schema.js'

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export async function getAnalyticsSummary(tenantId: string, days: number) {
  const cutoff = since(days)

  const [scansTotal] = await db
    .select({ v: sql<number>`count(*)` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, cutoff)))

  const [blocked] = await db
    .select({ v: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.action, 'block'), gte(events.occurredAt, cutoff)))

  const [warned] = await db
    .select({ v: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.action, 'warn'), gte(events.occurredAt, cutoff)))

  const [activeUsers] = await db
    .select({ v: sql<number>`count(distinct ${scans.memberId})` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), isNotNull(scans.memberId), gte(scans.occurredAt, cutoff)))

  const [totalMembers] = await db
    .select({ v: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.tenantId, tenantId))

  const [activeRulesCount] = await db
    .select({ v: sql<number>`count(*)` })
    .from(rules)
    .where(and(eq(rules.tenantId, tenantId), eq(rules.active, true)))

  return {
    scansTotal:       Number(scansTotal!.v),
    blocked:          Number(blocked!.v),
    warned:           Number(warned!.v),
    activeUsers:      Number(activeUsers!.v),
    totalMembers:     Number(totalMembers!.v),
    activeRulesCount: Number(activeRulesCount!.v),
  }
}

export async function getAnalyticsDaily(tenantId: string) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const buckets: { date: string; day: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.push({ date: d.toISOString().slice(0, 10), day: DAY_NAMES[d.getUTCDay()]! })
  }
  const cutoff = new Date(buckets[0]!.date + 'T00:00:00Z')

  const eventsRows = await db
    .select({ occurredAt: events.occurredAt, action: events.action })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))

  const scansRows = await db
    .select({ occurredAt: scans.occurredAt })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, cutoff)))

  return buckets.map(({ date, day }) => ({
    day,
    date,
    blocked: eventsRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date && r.action === 'block').length,
    warned:  eventsRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date && r.action === 'warn').length,
    scanned: scansRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date).length,
  }))
}

export async function getAnalyticsIncidents(tenantId: string) {
  const rows = await db
    .select({
      id:          events.id,
      memberEmail: members.email,
      subjectName: subjects.name,
      ruleKind:    rules.kind,
      action:      events.action,
      siteUrl:     events.siteUrl,
      occurredAt:  events.occurredAt,
    })
    .from(events)
    .leftJoin(members,   eq(events.memberId, members.id))
    .innerJoin(rules,    eq(events.ruleId, rules.id))
    .innerJoin(subjects, eq(rules.subjectId, subjects.id))
    .where(eq(events.tenantId, tenantId))
    .orderBy(desc(events.occurredAt))
    .limit(20)

  return rows.map(r => ({
    id:          r.id,
    memberEmail: r.memberEmail ?? null,
    subjectName: r.subjectName,
    ruleKind:    r.ruleKind,
    action:      r.action,
    siteUrl:     r.siteUrl,
    occurredAt:  r.occurredAt.toISOString(),
  }))
}

export async function getAnalyticsTopSites(tenantId: string, days: number) {
  const cutoff = since(days)
  const rows = await db
    .select({ siteUrl: events.siteUrl, cnt: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(events.siteUrl)

  const byDomain = new Map<string, number>()
  for (const row of rows) {
    try {
      const domain = new URL(row.siteUrl).hostname
      byDomain.set(domain, (byDomain.get(domain) ?? 0) + Number(row.cnt))
    } catch { /* skip malformed URLs */ }
  }

  return [...byDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }))
}

export async function getAnalyticsBySubject(tenantId: string, days: number) {
  const cutoff = since(days)
  const rows = await db
    .select({ subjectName: subjects.name, cnt: sql<number>`count(*)` })
    .from(events)
    .innerJoin(rules,    eq(events.ruleId, rules.id))
    .innerJoin(subjects, eq(rules.subjectId, subjects.id))
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(subjects.name)

  const sorted = [...rows].sort((a, b) => Number(b.cnt) - Number(a.cnt)).slice(0, 5)
  const total = sorted.reduce((s, r) => s + Number(r.cnt), 0)

  return sorted.map(r => ({
    subjectName: r.subjectName,
    count:       Number(r.cnt),
    pct:         total > 0 ? Math.round(Number(r.cnt) / total * 100) : 0,
  }))
}
