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
import { desktopAuthRouter } from './desktop-auth/router.js'
// import { handleStripeEvent } from './billing/stripe.js'  // STRIPE DISABLED
import { handlePayPalEvent, verifyPayPalWebhookSignature } from './billing/paypal.js'
import { requestLoggingPlugin } from './logger/request-logging.js'
import { logger } from './logger/index.js'
import { env } from './env.js'

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
  if (env.NODE_ENV === 'production' && !env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN env var must be set in production')
  }

  // Guard: INTERNAL_SECRET gates the privileged /internal/* mesh, which trusts the
  // X-Tenant-ID header outright. An empty/short secret means an internet caller can
  // reach it (see docs/PILOT_SECURITY_REVIEW). Refuse to boot misconfigured in prod.
  if (env.NODE_ENV === 'production' && env.INTERNAL_SECRET.length < 32) {
    throw new Error('INTERNAL_SECRET env var must be set (>=32 chars) in production')
  }

  const corsOrigin = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',')
    : (env.NODE_ENV === 'test' ? true : ['https://pretzel-console.mykka.ai'])
  // ignoreTrailingSlash/caseSensitive: false so `/v1/tenant/` and `/HEALTH`
  // resolve to the same route as `/v1/tenant` and `/health` instead of a
  // generic 404 that gives integrators no hint the route exists nearby.
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    trustProxy: true,
    ignoreTrailingSlash: true,
    caseSensitive: false,
  })
  void app.register(cors, {
    origin:      corsOrigin,
    credentials: true,
  })

  // Collect only the public-facing `/v1/*` surface for `/docs` below — NOT
  // `/internal/*` (trusts X-Tenant-ID outright) or `/platform/v1/*`
  // (cross-tenant admin), which would otherwise hand an unauthenticated
  // caller a full map of the API's internal/admin surface for free,
  // including endpoints like rotate-org-token / rotate-admin-token.
  const publicRoutes: string[] = []
  app.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url.startsWith('/internal/') || routeOptions.url.startsWith('/platform/')) return
    const methods = Array.isArray(routeOptions.method) ? routeOptions.method.join(',') : routeOptions.method
    publicRoutes.push(`${methods} ${routeOptions.url}`)
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
  if (env.RATE_LIMIT_DISABLED !== 'true') {
    void app.register(rateLimit, {
      global:     true,
      max:        Number(env.RATE_LIMIT_MAX ?? 100),
      timeWindow: env.RATE_LIMIT_WINDOW ?? '1 minute',
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

  const INTERNAL_SECRET = env.INTERNAL_SECRET
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
      catch (e) {
        // Fastify's built-in JSON parser tags parse failures with statusCode
        // 400; this custom parser exists only so webhook routes can see the
        // raw body for signature verification, but the SyntaxError from
        // JSON.parse below has no statusCode of its own — without tagging
        // it here, the global error handler's `err.statusCode ?? 500`
        // falls through to 500 for every malformed request body.
        //
        // The raw SyntaxError message (e.g. "Expected property name or '}'
        // in JSON at position 1") is V8-internal parser wording, not an
        // app-authored message — buildErrorBody() passes 4xx messages
        // through verbatim on the assumption they're safe to show, so swap
        // in a generic message here instead of leaking the implementation
        // detail. The original stays logged for debugging.
        logger.warn('Malformed JSON request body', { url: req.url, parseError: (e as Error).message })
        const parseError = new Error('Invalid JSON body') as Error & { statusCode?: number }
        parseError.statusCode = 400
        done(parseError)
      }
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
  void app.register(desktopAuthRouter, { prefix: '/auth/desktop' })
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

  // Without this, Fastify's built-in 404 uses its own envelope shape
  // ({"message","error","statusCode"}) — different from every other error
  // response in this API ({"error"}), so route the not-found case through
  // the same buildErrorBody() everything else uses.
  app.setNotFoundHandler((req, reply) => {
    const traceId = req.headers['x-trace-id'] as string | undefined
    return reply.status(404).send(buildErrorBody(404, 'Not Found', traceId))
  })

  app.get('/health', async () => ({ ok: true }))
  // Bare API-discovery response so a liveness check or curl against '/' gets
  // a 200 instead of a bare 404 — no internal detail, just confirms this is
  // the pretzel API and points at /health.
  app.get('/', async () => ({ service: 'pretzel-api', health: '/health', routes: '/docs' }))
  // Minimal route catalog (no full OpenAPI spec) so an integrator/QA pass
  // can enumerate the public API surface without reading source. Only
  // `publicRoutes` (populated by the onRoute hook above, which excludes
  // /internal/* and /platform/*) is exposed here — deliberately unauthenticated
  // since it lists nothing sensitive.
  app.get('/docs', async (_req, reply) => {
    reply.type('text/plain')
    return publicRoutes.sort().join('\n')
  })
  return app
}
