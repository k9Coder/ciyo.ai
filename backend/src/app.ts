import Fastify from 'fastify'
import cors from '@fastify/cors'
import { randomUUID } from 'node:crypto'
import './types.js'
import { requestContext } from './context/request-context.js'
import { rulesInternalRouter }              from './internal/rules.router.js'
import { subjectsInternalRouter }           from './internal/subjects.router.js'
import { divisionsInternalRouter }          from './internal/divisions.router.js'
import { teamsInternalRouter }              from './internal/teams.router.js'
import { membersInternalRouter }            from './internal/members.router.js'
import { tenantsInternalRouter }            from './internal/tenants.router.js'
import { usersInternalRouter }              from './internal/users.router.js'
import { destinationGroupsInternalRouter }  from './internal/destination-groups.router.js'
import { policyRouter } from './policy/router.js'
import { divisionsRouter } from './divisions/router.js'
import { teamsRouter } from './teams/router.js'
import { membersRouter } from './members/router.js'
import { subjectsRouter } from './subjects/router.js'
import { rulesRouter } from './rules/router.js'
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
import { onboardingRouter } from './onboarding/router.js'
import { telemetryRouter } from './telemetry/router.js'
import { meRouter } from './me/router.js'
// import { handleStripeEvent } from './billing/stripe.js'  // STRIPE DISABLED
import { handlePayPalEvent, verifyPayPalWebhookSignature } from './billing/paypal.js'
import { requestLoggingPlugin } from './logger/request-logging.js'
import { logger } from './logger/index.js'

export function buildApp() {
  // Guard: CORS_ORIGIN must be set explicitly in production — never default to wildcard
  if (process.env['NODE_ENV'] === 'production' && !process.env['CORS_ORIGIN']) {
    throw new Error('CORS_ORIGIN env var must be set in production')
  }

  const corsOrigin = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',')
    : (process.env['NODE_ENV'] === 'test' ? true : ['https://console.ciyo.ai'])
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors, {
    origin:      corsOrigin,
    credentials: true,
  })
  void app.register(requestLoggingPlugin)

  app.addHook('onRequest', (req, _reply, done) => {
    const traceId = (req.headers['x-trace-id'] as string) ?? randomUUID()
    req.headers['x-trace-id'] = traceId
    requestContext.run({ traceId, isM2M: req.headers['x-m2m'] === 'true' }, done)
  })

  const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? ''
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/internal/')) return
    if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
      return reply.code(404).send()
    }
  })

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks/clerk') || req.url?.startsWith('/webhooks/paypal')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  // app.post('/webhooks/stripe', async (request, reply) => {  // STRIPE DISABLED
  //   await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
  //   return reply.status(200).send({ received: true })
  // })

  app.post('/webhooks/paypal', async (request, reply) => {
    const rawBody = request.body as string

    // Verify PayPal webhook signature before processing any event
    const verified = await verifyPayPalWebhookSignature(rawBody, {
      transmissionId:   (request.headers['paypal-transmission-id']   as string) ?? '',
      transmissionTime: (request.headers['paypal-transmission-time'] as string) ?? '',
      certUrl:          (request.headers['paypal-cert-url']          as string) ?? '',
      transmissionSig:  (request.headers['paypal-transmission-sig']  as string) ?? '',
    })

    if (!verified) {
      logger.warn('PayPal webhook signature verification failed', { url: request.url })
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>
    } catch {
      return reply.status(400).send({ error: 'Invalid JSON body' })
    }

    await handlePayPalEvent(body)
    return reply.status(200).send({ received: true })
  })

  void app.register(policyRouter, { prefix: '/v1' })
  void app.register(divisionsRouter, { prefix: '/v1' })
  void app.register(teamsRouter, { prefix: '/v1' })
  void app.register(membersRouter, { prefix: '/v1' })
  void app.register(subjectsRouter, { prefix: '/v1' })
  void app.register(rulesRouter, { prefix: '/v1' })
  void app.register(destinationGroupsRouter, { prefix: '/v1' })
  void app.register(siteConfigsRouter, { prefix: '/v1' })
  void app.register(eventsRouter, { prefix: '/v1' })
  void app.register(scansRouter, { prefix: '/v1' })
  void app.register(analyticsRouter, { prefix: '/v1' })
  void app.register(auditLogRouter,  { prefix: '/v1' })
  void app.register(tenantsRouter,   { prefix: '/v1' })
  void app.register(assistantRouter, { prefix: '/v1' })
  void app.register(invitesRouter,   { prefix: '/v1' })
  void app.register(billingRouter,    { prefix: '/v1' })
  void app.register(onboardingRouter, { prefix: '/v1' })
  void app.register(telemetryRouter,  { prefix: '/v1' })
  void app.register(meRouter,         { prefix: '/v1' })
  void app.register(platformRouter,  { prefix: '/platform/v1' })
  void app.register(clerkWebhookRouter)

  void app.register(rulesInternalRouter,             { prefix: '/internal/v1/rules' })
  void app.register(subjectsInternalRouter,          { prefix: '/internal/v1/subjects' })
  void app.register(divisionsInternalRouter,         { prefix: '/internal/v1/divisions' })
  void app.register(teamsInternalRouter,             { prefix: '/internal/v1/teams' })
  void app.register(membersInternalRouter,           { prefix: '/internal/v1/members' })
  void app.register(tenantsInternalRouter,           { prefix: '/internal/v1/tenants' })
  void app.register(usersInternalRouter,             { prefix: '/internal/v1/users' })
  void app.register(destinationGroupsInternalRouter, { prefix: '/internal/v1/destination-groups' })

  app.setErrorHandler((err, _req, reply) => {
    logger.error('Unhandled error', { message: err.message, stack: err.stack })
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
