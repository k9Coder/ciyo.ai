import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth, requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  recordEnforcementSignal,
  recordShadowVerdicts,
  recordJudgeShadowChecks,
  JUDGE_SHADOW_SURFACES,
  JUDGE_SHADOW_RULE_KINDS,
  JUDGE_SHADOW_PRIMARY_ACTIONS,
  JUDGE_SHADOW_SECONDARY_VERDICTS,
  type JudgeShadowRowInput,
  recentDegraded,
  silentFailureSuspected,
  ENFORCEMENT_REASONS,
  SHADOW_VERDICT_KINDS,
  SHADOW_VERDICT_OUTCOMES,
  type EnforcementReason,
  type ShadowVerdictInput,
} from './service.js'

const MAX_SHADOW_VERDICT_BATCH = 200
const MAX_JUDGE_SHADOW_BATCH = 100
const MODEL_VERSION_RE = /^[a-z0-9_.+-]{1,32}$/

const JUDGE_SHADOW_KEYS = [
  'checkId', 'surface', 'ruleId', 'ruleKind', 'primaryAction', 'secondaryVerdict', 'fastScore', 'secondScore',
  'spanStart', 'spanEnd', 'messageChars', 'windows', 'latencyMs', 'modelVersion', 'occurredAt',
] as const

const isUint = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isScore = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)

/** Returns an error message, or null when the row is valid. Exact key set: nothing else (no prompt text) fits. */
export function judgeShadowRowError(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'each row must be an object'
  const r = raw as Record<string, unknown>
  const keys = Object.keys(r)
  if (keys.length !== JUDGE_SHADOW_KEYS.length || !JUDGE_SHADOW_KEYS.every((k) => k in r)) {
    return 'row must have exactly the keys ' + JUDGE_SHADOW_KEYS.join(', ')
  }
  if (typeof r.checkId !== 'string' || !UUID_RE.test(r.checkId)) return 'checkId must be a UUID'
  if (typeof r.ruleId !== 'string' || !UUID_RE.test(r.ruleId)) return 'ruleId must be a UUID'
  if (!JUDGE_SHADOW_SURFACES.includes(r.surface as never)) return 'surface must be one of ' + JUDGE_SHADOW_SURFACES.join(', ')
  if (!JUDGE_SHADOW_RULE_KINDS.includes(r.ruleKind as never)) return 'ruleKind must be one of ' + JUDGE_SHADOW_RULE_KINDS.join(', ')
  if (!JUDGE_SHADOW_PRIMARY_ACTIONS.includes(r.primaryAction as never)) return 'primaryAction must be one of ' + JUDGE_SHADOW_PRIMARY_ACTIONS.join(', ')
  if (!JUDGE_SHADOW_SECONDARY_VERDICTS.includes(r.secondaryVerdict as never)) return 'secondaryVerdict must be one of ' + JUDGE_SHADOW_SECONDARY_VERDICTS.join(', ')
  if (!isScore(r.fastScore) || !isScore(r.secondScore)) return 'scores must be null or a number between 0 and 1'
  if ((r.spanStart === null) !== (r.spanEnd === null)) return 'spanStart and spanEnd must both be set or both be null'
  if (r.spanStart !== null && (!isUint(r.spanStart) || !isUint(r.spanEnd) || (r.spanEnd as number) < r.spanStart)) {
    return 'span must be non-negative integers with spanEnd >= spanStart'
  }
  if (!isUint(r.messageChars) || !isUint(r.windows) || !isUint(r.latencyMs)) return 'messageChars, windows and latencyMs must be non-negative integers'
  if (typeof r.modelVersion !== 'string' || !MODEL_VERSION_RE.test(r.modelVersion)) return 'modelVersion is malformed'
  if (typeof r.occurredAt !== 'string' || Number.isNaN(new Date(r.occurredAt).getTime())) return 'occurredAt must be a valid ISO date string'
  return null
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function telemetryRouter(fastify: FastifyInstance): Promise<void> {
  // Client (extension) reports a degraded-enforcement event. No prompt content.
  fastify.post('/telemetry/enforcement', { preHandler: requireOrgTokenOrClerkAuth, bodyLimit: 8 * 1024 }, async (req, reply) => {
    const body = req.body as { hostname?: string; reason?: string; extVersion?: string }

    if (!body.hostname || typeof body.hostname !== 'string') {
      return reply.status(400).send({ error: 'hostname is required' })
    }
    if (!body.reason || !ENFORCEMENT_REASONS.includes(body.reason as EnforcementReason)) {
      return reply.status(400).send({ error: 'reason must be one of ' + ENFORCEMENT_REASONS.join(', ') })
    }

    await recordEnforcementSignal(req.tenant.id, req.member?.id ?? null, {
      hostname:   body.hostname.slice(0, 253),
      reason:     body.reason as EnforcementReason,
      extVersion: typeof body.extVersion === 'string' ? body.extVersion.slice(0, 32) : null,
    })
    return reply.status(204).send()
  })

  // Console reads the degraded summary for its banner + silent-failure alarm.
  fastify.get('/telemetry/enforcement/summary', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const [degraded, silentFailure] = await Promise.all([
      recentDegraded(req.tenant.id, 60),
      silentFailureSuspected(req.tenant.id),
    ])
    return { degraded, silentFailure }
  })

  // Client (desktop/extension) reports legacy-rule shadow matches. No prompt
  // content — only ruleId/kind/verdict/confidence/timestamp.
  fastify.post('/telemetry/shadow-verdict', { preHandler: requireOrgTokenOrClerkAuth, bodyLimit: 64 * 1024 }, async (req, reply) => {
    const body = req.body
    if (!Array.isArray(body)) {
      return reply.status(400).send({ error: 'request body must be an array' })
    }
    if (body.length > MAX_SHADOW_VERDICT_BATCH) {
      return reply.status(400).send({ error: `batch too large (max ${MAX_SHADOW_VERDICT_BATCH} items)` })
    }
    if (body.length === 0) {
      return reply.status(204).send()
    }

    const items: ShadowVerdictInput[] = []
    for (const raw of body as unknown[]) {
      const item = raw as Partial<ShadowVerdictInput & { enforced: unknown }>
      if (!item.ruleId || typeof item.ruleId !== 'string' || !UUID_RE.test(item.ruleId)) {
        return reply.status(400).send({ error: 'ruleId must be a valid UUID' })
      }
      if (!SHADOW_VERDICT_KINDS.includes(item.kind as never)) {
        return reply.status(400).send({ error: 'kind must be one of ' + SHADOW_VERDICT_KINDS.join(', ') })
      }
      if (!SHADOW_VERDICT_OUTCOMES.includes(item.verdict as never)) {
        return reply.status(400).send({ error: 'verdict must be one of ' + SHADOW_VERDICT_OUTCOMES.join(', ') })
      }
      if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
        return reply.status(400).send({ error: 'confidence must be a number between 0 and 1' })
      }
      if (typeof item.timestamp !== 'string' || Number.isNaN(new Date(item.timestamp).getTime())) {
        return reply.status(400).send({ error: 'timestamp must be a valid ISO date string' })
      }
      items.push({
        ruleId:     item.ruleId,
        kind:       item.kind as ShadowVerdictInput['kind'],
        verdict:    item.verdict as ShadowVerdictInput['verdict'],
        confidence: item.confidence,
        timestamp:  item.timestamp,
      })
    }

    await recordShadowVerdicts(req.tenant.id, items)
    return reply.status(204).send()
  })

  // Judge v2 shadow rows (desktop/extension). Content-free by construction:
  // exact key whitelist, enums, UUIDs, numbers — see judgeShadowRowError.
  fastify.post('/telemetry/judge-shadow', { preHandler: requireOrgTokenOrClerkAuth, bodyLimit: 64 * 1024 }, async (req, reply) => {
    const body = req.body
    if (!Array.isArray(body)) return reply.status(400).send({ error: 'request body must be an array' })
    if (body.length > MAX_JUDGE_SHADOW_BATCH) return reply.status(400).send({ error: `batch too large (max ${MAX_JUDGE_SHADOW_BATCH} rows)` })
    if (body.length === 0) return reply.status(204).send()
    for (const raw of body as unknown[]) {
      const error = judgeShadowRowError(raw)
      if (error) return reply.status(400).send({ error })
    }
    await recordJudgeShadowChecks(req.tenant.id, req.member?.id ?? null, body as JudgeShadowRowInput[])
    return reply.status(204).send()
  })
}
