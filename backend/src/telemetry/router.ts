import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth, requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  recordEnforcementSignal,
  recordShadowVerdicts,
  recentDegraded,
  silentFailureSuspected,
  ENFORCEMENT_REASONS,
  SHADOW_VERDICT_KINDS,
  SHADOW_VERDICT_OUTCOMES,
  type EnforcementReason,
  type ShadowVerdictInput,
} from './service.js'

const MAX_SHADOW_VERDICT_BATCH = 200

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
      if (!item.ruleId || typeof item.ruleId !== 'string') {
        return reply.status(400).send({ error: 'ruleId is required' })
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
}
