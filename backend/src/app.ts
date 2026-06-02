import Fastify from 'fastify'
import cors from '@fastify/cors'
import './types.js'
import { policyRouter } from './policy/router.js'
import { divisionsRouter } from './divisions/router.js'
import { teamsRouter } from './teams/router.js'
import { membersRouter } from './members/router.js'
import { subjectsRouter } from './subjects/router.js'
import { rulesRouter } from './rules/router.js'
import { joinRouter } from './auth/join.js'
import { destinationGroupsRouter } from './destination-groups/router.js'
import { siteConfigsRouter } from './site-configs/router.js'
import { clerkWebhookRouter } from './webhooks/clerk.js'
import { eventsRouter } from './events/router.js'
import { scansRouter } from './scans/router.js'
import { analyticsRouter } from './analytics/router.js'
import { auditLogRouter } from './audit-log/router.js'
import { tenantsRouter } from './tenants/router.js'
import { assistantRouter } from './assistant/router.js'
import { platformRouter } from './platform/router.js'
import { invitesRouter } from './invites/router.js'
import { billingRouter } from './billing/router.js'
import { handleStripeEvent } from './billing/stripe.js'
import { handlePayPalEvent } from './billing/paypal.js'
import { requestLoggingPlugin } from './logger/request-logging.js'
import { logger } from './logger/index.js'

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors)
  void app.register(requestLoggingPlugin)

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks/stripe') || req.url?.startsWith('/webhooks/clerk')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
    return reply.status(200).send({ received: true })
  })

  app.post('/webhooks/paypal', async (request, reply) => {
    await handlePayPalEvent(request.body as Record<string, unknown>)
    return reply.status(200).send({ received: true })
  })

  void app.register(policyRouter, { prefix: '/v1' })
  void app.register(divisionsRouter, { prefix: '/v1' })
  void app.register(teamsRouter, { prefix: '/v1' })
  void app.register(membersRouter, { prefix: '/v1' })
  void app.register(subjectsRouter, { prefix: '/v1' })
  void app.register(rulesRouter, { prefix: '/v1' })
  void app.register(joinRouter, { prefix: '/v1' })
  void app.register(destinationGroupsRouter, { prefix: '/v1' })
  void app.register(siteConfigsRouter, { prefix: '/v1' })
  void app.register(eventsRouter, { prefix: '/v1' })
  void app.register(scansRouter, { prefix: '/v1' })
  void app.register(analyticsRouter, { prefix: '/v1' })
  void app.register(auditLogRouter,  { prefix: '/v1' })
  void app.register(tenantsRouter,   { prefix: '/v1' })
  void app.register(assistantRouter, { prefix: '/v1' })
  void app.register(invitesRouter,   { prefix: '/v1' })
  void app.register(billingRouter,   { prefix: '/v1' })
  void app.register(platformRouter,  { prefix: '/platform/v1' })
  void app.register(clerkWebhookRouter)

  app.setErrorHandler((err, _req, reply) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack })
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
