import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth, requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  recordEnforcementSignal,
  recentDegraded,
  silentFailureSuspected,
  ENFORCEMENT_REASONS,
  type EnforcementReason,
} from './service.js'

export async function telemetryRouter(fastify: FastifyInstance): Promise<void> {
  // Client (extension) reports a degraded-enforcement event. No prompt content.
  fastify.post('/telemetry/enforcement', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
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
}
