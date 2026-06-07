import type { FastifyInstance } from 'fastify'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members, scans } from '../db/schema.js'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { freeTierSignup } from './service.js'
import { createCheckoutSession, createPortalSession } from './stripe.js'
import { createPayPalSubscriptionUrl } from './paypal.js'
import { PLAN_LIMITS, getScanLimit, getSeatLimit, isOverScanLimit, type Plan } from './limits.js'

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

  // ── Stripe checkout session ───────────────────────────────────────────────
  fastify.post<{
    Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; email: string }
  }>('/billing/stripe/checkout', async (req, reply) => {
    const { plan, seatCount, tenantName, email } = req.body
    if (!plan || !tenantName || !email) {
      return reply.status(400).send({ error: 'plan, tenantName, and email are required' })
    }
    if (plan === 'business' && (seatCount ?? 0) < 10) {
      return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
    }
    try {
      return reply.send(await createCheckoutSession({ plan, seatCount: seatCount ?? 1, tenantName, email }))
    } catch (err: unknown) {
      return reply.status(500).send({ error: err instanceof Error ? err.message : 'Failed to create checkout session' })
    }
  })

  // ── Stripe customer portal ────────────────────────────────────────────────
  fastify.post<{ Body: { returnUrl?: string } }>(
    '/billing/stripe/portal',
    { preHandler: requireAdminTokenOrClerkAdmin },
    async (req, reply) => {
      const customerId = req.tenant.stripeCustomerId
      if (!customerId) {
        return reply.status(400).send({ error: 'No Stripe customer associated with this account' })
      }
      const returnUrl = req.body?.returnUrl
        ?? `${process.env['CONSOLE_URL'] ?? 'https://console.ciyo.ai'}/settings`
      try {
        return reply.send(await createPortalSession({ stripeCustomerId: customerId, returnUrl }))
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : 'Failed to create portal session' })
      }
    }
  )

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

    const [[scanRow], [seatRow]] = await Promise.all([
      db.select({ n: count() }).from(scans)
        .where(and(eq(scans.tenantId, tenant.id), gte(scans.occurredAt, start))),
      db.select({ n: count() }).from(members)
        .where(eq(members.tenantId, tenant.id)),
    ])

    const monthlyScans = scanRow?.n ?? 0
    const currentSeats = seatRow?.n ?? 0
    const scanLimit    = getScanLimit(plan)
    const seatLimit    = getSeatLimit(plan)

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
        assistantEnabled:  PLAN_LIMITS[plan]?.assistantEnabled ?? false,
        advancedAnalytics: PLAN_LIMITS[plan]?.advancedAnalytics ?? false,
      },
    })
  })
}
