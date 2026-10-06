import { and, eq, inArray } from 'drizzle-orm'
import safeRegex from 'safe-regex2'
import { db } from '../db/client.js'
import { rules, type Rule, type NewRule } from '../db/schema.js'
import { assertRuleKindAllowed, type Plan } from '../billing/limits.js'
import { tenantsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

// Regex patterns on rules ship to every user's browser and the desktop proxy,
// where they run against untrusted input. Reject unsafe patterns at this choke
// point (shared by the HTTP router and the assistant apply path) so a bad regex
// never reaches an enforcement surface.
const MAX_PATTERN_LENGTH = 500

// judge_prompt is the sole real enforcement mechanism for its own rule — an
// empty prompt isn't an inert no-op, it's an empty claim the on-device model
// would judge every message against (an arbitrary-match risk, not a safe
// default). Same choke point as validatePattern, shared by the HTTP router
// and the assistant apply path.
const MAX_PROMPT_LENGTH = 1000

function validateJudgePrompt(prompt: string | null | undefined): void {
  if (!prompt?.trim()) {
    throw Object.assign(
      new Error('judge_prompt rules require a non-empty prompt.'),
      { statusCode: 400 }
    )
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    throw Object.assign(
      new Error(`Rule prompt is too long (${prompt.length} chars, max ${MAX_PROMPT_LENGTH}).`),
      { statusCode: 400 }
    )
  }
}

function validatePattern(pattern: string): void {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw Object.assign(
      new Error(`Rule pattern is too long (${pattern.length} chars, max ${MAX_PATTERN_LENGTH}).`),
      { statusCode: 400 }
    )
  }
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern)
  } catch (err) {
    throw Object.assign(
      new Error(`Rule pattern is not a valid regular expression: ${(err as Error).message}`),
      { statusCode: 400 }
    )
  }
  // ReDoS guard: reject catastrophic-backtracking patterns (e.g. "(a+)+$").
  if (!safeRegex(pattern)) {
    throw Object.assign(
      new Error(`Rule pattern is potentially unsafe (ReDoS risk) and was rejected: ${pattern}`),
      { statusCode: 400 }
    )
  }
}

/**
 * Fetch the tenant plan and enforce the rule-kind entitlement. Single choke
 * point for both the HTTP router and the assistant/internal apply path.
 */
async function enforceRuleKind(tenantId: string, kind: string): Promise<void> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId
  const tenant = await tenantsClient.get<{ plan: string }>(`/${tenantId}`)
    .then(r => r.data)
    .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })
  if (!tenant) return
  assertRuleKindAllowed(tenant.plan as Plan, kind)
}

export async function getRuleById(tenantId: string, id: string): Promise<Rule | null> {
  const [row] = await db.select().from(rules)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
  return row ?? null
}

export async function listRules(tenantId: string, subjectId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.subjectId, subjectId), eq(rules.active, true))
  )
}

export async function listAllActiveRules(tenantId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.active, true))
  )
}

export async function createRule(
  tenantId: string,
  subjectId: string,
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'prompt' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'>
): Promise<Rule> {
  await enforceRuleKind(tenantId, data.kind)
  if (data.pattern) validatePattern(data.pattern)
  if (data.kind === 'judge_prompt') validateJudgePrompt(data.prompt)
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'prompt' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'active' | 'reportLevel'>>
): Promise<Rule | null> {
  if (data.kind) await enforceRuleKind(tenantId, data.kind)
  if (data.pattern) validatePattern(data.pattern)
  // 'prompt' is only ever meaningfully set for judge_prompt rules — no
  // caller touches it for any other kind, so validating whenever it's
  // explicitly present in the patch (regardless of whether `kind` is also
  // being changed in this same call) catches clearing an existing
  // judge_prompt rule's prompt without needing an extra read of its
  // current kind.
  if (data.prompt !== undefined) validateJudgePrompt(data.prompt)
  const [row] = await db
    .update(rules)
    .set(data)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
}

export async function getSubjectIdsByRuleIds(
  tenantId: string,
  ruleIds: string[],
): Promise<Array<{ subjectId: string }>> {
  if (ruleIds.length === 0) return []
  return db.select({ subjectId: rules.subjectId }).from(rules)
    .where(and(eq(rules.tenantId, tenantId), inArray(rules.id, ruleIds)))
}
