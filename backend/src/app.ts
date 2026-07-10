import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { randomUUID, timingSafeEqual } from 'node:crypto'
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

/**
 * Client-facing error body. 5xx (and untagged) errors must not leak internal
 * messages (driver strings, internal-client `[code] message`, stack-adjacent
 * detail) — return a generic message plus the traceId so support can correlate
 * with the full server-side log. Explicitly-tagged 4xx keep their message.
 */
export function buildErrorBody(
  statusCode: number,
  message: string,
  traceId?: string,
): { error: string; traceId?: string } {
  if (statusCode >= 500) {
    return traceId ? { error: 'Internal error', traceId } : { error: 'Internal error' }
  }
  return { error: message }
}

export function buildApp() {
  // Guard: CORS_ORIGIN must be set explicitly in production — never default to wildcard
  if (process.env['NODE_ENV'] === 'production' && !process.env['CORS_ORIGIN']) {
    throw new Error('CORS_ORIGIN env var must be set in production')
  }

  // Guard: INTERNAL_SECRET gates the privileged /internal/* mesh, which trusts the
  // X-Tenant-ID header outright. An empty/short secret means an internet caller can
  // reach it (see docs/PILOT_SECURITY_REVIEW). Refuse to boot misconfigured in prod.
  if (process.env['NODE_ENV'] === 'production'
      && (!process.env['INTERNAL_SECRET'] || process.env['INTERNAL_SECRET'].length < 32)) {
    throw new Error('INTERNAL_SECRET env var must be set (>=32 chars) in production')
  }

  const corsOrigin = process.env['CORS_ORIGIN']
    ? process.env['CORS_ORIGIN'].split(',')
    : (process.env['NODE_ENV'] === 'test' ? true : ['https://console.ciyo.ai'])
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test', trustProxy: true })
  void app.register(cors, {
    origin:      corsOrigin,
    credentials: true,
  })

  // Security headers. This is a JSON API consumed cross-origin by the console,
  // extension, and desktop app, so CSP (an HTML concern) lives on the console's
  // nginx instead, and CORP is relaxed to cross-origin so those clients aren't
  // blocked. Helmet still adds HSTS, X-Content-Type-Options: nosniff, frameguard,
  // and Referrer-Policy.
  void app.register(helmet, {
    contentSecurityPolicy:     false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })

  // Rate limiting. Disabled in unit/e2e (RATE_LIMIT_DISABLED=true) so the loopback
  // test runner is never throttled; enabled by default everywhere else. Authenticated
  // requests are keyed by tenant (X-Tenant-Id) so one corporate NAT IP can't starve a
  // whole org; unauthenticated requests fall back to client IP. Per-route tighter
  // buckets are set on the abuse-prone routes via their own `config.rateLimit`.
  if (process.env['RATE_LIMIT_DISABLED'] !== 'true') {
    void app.register(rateLimit, {
      global:     true,
      max:        Number(process.env['RATE_LIMIT_MAX'] ?? 100),
      timeWindow: process.env['RATE_LIMIT_WINDOW'] ?? '1 minute',
      keyGenerator: (req) => (req.headers['x-tenant-id'] as string) || req.ip,
      // Never throttle the health check — uptime monitors poll it frequently.
      allowList: (req) => req.url === '/health' || req.url.startsWith('/health?'),
    })
  }

  void app.register(requestLoggingPlugin)

  app.addHook('onRequest', (req, _reply, done) => {
    // Strip internal-mesh headers off any request that is NOT an internal call, so a
    // public caller cannot spoof machine-to-machine context (isM2M), the initiator,
    // or probe the internal secret. X-Tenant-ID is intentionally kept — on public
    // routes it is validated against the caller's memberships by the auth middleware.
    if (!req.url.startsWith('/internal/')) {
      delete req.headers['x-internal-secret']
      delete req.headers['x-m2m']
      delete req.headers['x-initiator-id']
    }
    const traceId = (req.headers['x-trace-id'] as string) ?? randomUUID()
    req.headers['x-trace-id'] = traceId
    requestContext.run({ traceId, isM2M: req.headers['x-m2m'] === 'true' }, done)
  })

  const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? ''
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/internal/')) return
    const provided = req.headers['x-internal-secret']
    // Reject missing/empty before comparing: an empty provided value must never match
    // an unset ('') INTERNAL_SECRET. Constant-time compare over equal-length buffers
    // avoids leaking the secret via response timing.
    if (typeof provided !== 'string' || provided.length === 0 || INTERNAL_SECRET.length === 0) {
      return reply.code(404).send()
    }
    const a = Buffer.from(provided)
    const b = Buffer.from(INTERNAL_SECRET)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
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

  app.setErrorHandler((err, req, reply) => {
    const statusCode = (err as { statusCode?: number }).statusCode ?? 500
    logger.error('Unhandled error', { message: err.message, stack: err.stack, statusCode })
    const traceId = req.headers['x-trace-id'] as string | undefined
    return reply.status(statusCode).send(buildErrorBody(statusCode, err.message, traceId))
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
