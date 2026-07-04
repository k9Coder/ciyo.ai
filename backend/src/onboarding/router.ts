import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { applyTemplate, completeWizardSkip } from './service.js'

const VALID_PROFESSIONS = new Set(['accountant', 'developer', 'legal', 'healthcare', 'other'])

export async function onboardingRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/onboarding/apply-template', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { profession?: string; followUpAnswer?: string }
    const profession = body.profession?.trim().toLowerCase()
    const followUpAnswer = body.followUpAnswer?.trim().toLowerCase() ?? ''

    if (!profession || !VALID_PROFESSIONS.has(profession)) {
      return reply.status(400).send({ error: 'Invalid profession' })
    }

    const result = await applyTemplate(req.tenant.id, profession, followUpAnswer)

    if (result.status === 'created') {
      return reply.status(201).send({ policyId: result.policyId, wizardCompleted: true })
    }
    if (result.status === 'already_existed') {
      return reply.status(200).send({ policyId: result.policyId, wizardCompleted: true, alreadyExisted: true })
    }
    // no_policy (other, skip, no template found)
    return reply.status(200).send({ policyId: null, wizardCompleted: true })
  })

  fastify.post('/onboarding/skip', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await completeWizardSkip(req.tenant.id)
    return reply.status(200).send({ policyId: null, wizardCompleted: true })
  })
}
