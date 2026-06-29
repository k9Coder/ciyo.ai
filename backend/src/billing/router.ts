import type { FastifyInstance } from 'fastify'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members, scans } from '../db/schema.js'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { freeTierSignup } from './service.js'
// import { createCheckoutSession, createPortalSession } from './stripe.js'  // STRIPE DISABLED
import { createPayPalSubscriptionUrl } from './paypal.js'
import { PLAN_LIMITS, getScanLimit, getSeatLimit, isOverScanLimit, type Plan } from './limits.js'
import { countPromptsUsedToday } from '../assistant/router.js'

export async function billingRouter(fastify: FastifyInstance): Promise<void> {

  // ── Free-tier self-signup ─────────────────────────────────────────────────
  fastify.post<{ Body: { name: string; email: string } }>(
    '/billing/free-signup',
    async (req, reply) => {
      const { name, email } = req.body
      if (!name || !email) {
        return reply.status(400).send({ error: 'name and email are required' })
      }
      try {
        const result = await freeTierSignup({ name, email })
        return reply.status(201).send(result)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to create account'
        return reply.status(409).send({ error: msg })
      }
    }
  )

  // ── Stripe checkout session — DISABLED ───────────────────────────────────
  // fastify.post('/billing/stripe/checkout', ...)  // STRIPE DISABLED — uncomment imports in app.ts + router.ts to re-enable

  // ── Stripe customer portal — DISABLED ────────────────────────────────────
  // fastify.post('/billing/stripe/portal', ...)  // STRIPE DISABLED

  // ── PayPal subscription checkout ──────────────────────────────────────────
  fastify.post<{
    Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; email: string }
  }>('/billing/paypal/checkout', async (req, reply) => {
    const { plan, seatCount, tenantName, email } = req.body
    if (!plan || !tenantName || !email) {
      return reply.status(400).send({ error: 'plan, tenantName, and email are required' })
    }
    if (plan === 'business' && (seatCount ?? 0) < 10) {
      return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
    }
    try {
      return reply.send(await createPayPalSubscriptionUrl({ plan, seatCount: seatCount ?? 1, tenantName, email }))
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Failed to create PayPal subscription' })
    }
  })

  // ── Billing status ────────────────────────────────────────────────────────
  fastify.get('/billing/status', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const tenant = req.tenant
    const plan   = tenant.plan as Plan

    const start = new Date()
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)

    const [[scanRow], [seatRow], promptsUsedToday] = await Promise.all([
      db.select({ n: count() }).from(scans)
        .where(and(eq(scans.tenantId, tenant.id), gte(scans.occurredAt, start))),
      db.select({ n: count() }).from(members)
        .where(eq(members.tenantId, tenant.id)),
      countPromptsUsedToday(tenant.id),
    ])

    const monthlyScans = scanRow?.n ?? 0
    const currentSeats = seatRow?.n ?? 0
    const scanLimit    = getScanLimit(plan)
    const seatLimit    = getSeatLimit(plan)
    const limits       = PLAN_LIMITS[plan]

    return reply.send({
      plan,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt:        tenant.trialEndsAt?.toISOString() ?? null,
      seatCount:          currentSeats,
      seatLimit,
      monthlyScans,
      scanLimit,
      scanBlocked:        isOverScanLimit(plan, monthlyScans),
      paymentProvider:    tenant.paymentProvider ?? null,
      features: {
        assistantEnabled:  limits?.assistantEnabled  ?? false,
        advancedAnalytics: limits?.advancedAnalytics ?? false,
      },
      assistantLimits: {
        promptsPerDay:    limits?.assistantPromptsADay   ?? -1,
        promptsUsedToday,
        maximumTokens:    limits?.assistantMaximumTokens ?? -1,
      },
    })
  })
}
