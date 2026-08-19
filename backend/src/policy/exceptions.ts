/**
 * Per-member "always allow" exceptions — a member can mute a specific rule
 * for themselves (from a decision popup in pretzel-desktop today) without
 * an admin changing the org policy. Deliberately NOT silent to admins: see
 * getExceptionSummary, used by the admin-only GET /v1/policy/exceptions.
 */
import { eq, and } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memberRuleExceptions, members, rules } from '../db/schema.js'

export async function addException(tenantId: string, memberId: string, ruleId: string): Promise<void> {
  await db
    .insert(memberRuleExceptions)
    .values({ tenantId, memberId, ruleId })
    .onConflictDoNothing() // already excepted — idempotent
}

export async function removeException(tenantId: string, memberId: string, ruleId: string): Promise<void> {
  await db
    .delete(memberRuleExceptions)
    .where(and(
      eq(memberRuleExceptions.tenantId, tenantId),
      eq(memberRuleExceptions.memberId, memberId),
      eq(memberRuleExceptions.ruleId, ruleId),
    ))
}

/** Rule IDs this member has always-allowed — used to filter resolveMemberPolicy's output. */
export async function getMemberExceptionRuleIds(tenantId: string, memberId: string): Promise<Set<string>> {
  const rows = await db
    .select({ ruleId: memberRuleExceptions.ruleId })
    .from(memberRuleExceptions)
    .where(and(eq(memberRuleExceptions.tenantId, tenantId), eq(memberRuleExceptions.memberId, memberId)))
  return new Set(rows.map(r => r.ruleId))
}

export interface ExceptionSummaryEntry {
  ruleId:       string
  ruleMessage:  string | null
  memberCount:  number
  memberEmails: string[]
}

/** Tenant-wide summary for admins: which rules have members always-allowing them, and who. */
export async function getExceptionSummary(tenantId: string): Promise<ExceptionSummaryEntry[]> {
  const rows = await db
    .select({
      ruleId:      memberRuleExceptions.ruleId,
      ruleMessage: rules.message,
      memberEmail: members.email,
    })
    .from(memberRuleExceptions)
    .innerJoin(rules, eq(memberRuleExceptions.ruleId, rules.id))
    .innerJoin(members, eq(memberRuleExceptions.memberId, members.id))
    .where(eq(memberRuleExceptions.tenantId, tenantId))

  const byRule = new Map<string, ExceptionSummaryEntry>()
  for (const row of rows) {
    const existing = byRule.get(row.ruleId)
    if (existing) {
      existing.memberCount++
      existing.memberEmails.push(row.memberEmail)
    } else {
      byRule.set(row.ruleId, {
        ruleId: row.ruleId,
        ruleMessage: row.ruleMessage,
        memberCount: 1,
        memberEmails: [row.memberEmail],
      })
    }
  }
  return [...byRule.values()].sort((a, b) => b.memberCount - a.memberCount)
}
