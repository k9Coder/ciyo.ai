import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { activateTenant, updateSubscriptionStatus, tenantIdBySubId } from './service.js'
import { sendWelcomeEmail } from './email.js'

function stripe(): Stripe {
  return new Stripe(process.env['STRIPE_SECRET_KEY']!)
}

export async function createCheckoutSession(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  tenantSlug: string
  email:      string
}): Promise<{ url: string }> {
  const stripeClient = stripe()
  const priceId = opts.plan === 'business'
    ? process.env['STRIPE_BUSINESS_PRICE_ID']!
    : process.env['STRIPE_STARTER_PRICE_ID']!
  const trialDays = opts.plan === 'business' ? 14 : 0

  const session = await stripeClient.checkout.sessions.create({
    mode:                      'subscription',
    payment_method_collection: trialDays > 0 ? 'if_required' : 'always',
    customer_email:            opts.email,
    line_items: [{
      price:    priceId,
      quantity: opts.plan === 'business' ? opts.seatCount : 1,
    }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: {
        tenantName: opts.tenantName,
        tenantSlug: opts.tenantSlug,
        plan:       opts.plan,
        seatCount:  String(opts.seatCount),
      },
    },
    metadata: {
      tenantName: opts.tenantName,
      tenantSlug: opts.tenantSlug,
      plan:       opts.plan,
      seatCount:  String(opts.seatCount),
    },
    success_url: process.env['STRIPE_SUCCESS_URL'] ?? 'https://ciyo.ai/welcome',
    cancel_url:  process.env['STRIPE_CANCEL_URL']  ?? 'https://ciyo.ai/pricing',
  })

  return { url: session.url! }
}

export async function createPortalSession(opts: {
  stripeCustomerId: string
  returnUrl:        string
}): Promise<{ url: string }> {
  const stripeClient = stripe()
  const session = await stripeClient.billingPortal.sessions.create({
    customer:   opts.stripeCustomerId,
    return_url: opts.returnUrl,
  })
  return { url: session.url }
}

export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    const stripeClient = stripe()
    event = stripeClient.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const meta    = session.metadata ?? {}
      const email   = session.customer_email ?? ''
      const plan    = (meta['plan'] as 'starter' | 'business') ?? 'business'
      const seats   = parseInt(meta['seatCount'] ?? '10', 10)

      const sub      = typeof session.subscription === 'object' ? session.subscription as Stripe.Subscription : null
      const trialEnd = sub?.trial_end ? new Date(sub.trial_end * 1000) : null

      const result = await activateTenant({
        name:             meta['tenantName'] ?? email,
        slug:             meta['tenantSlug'] ?? email.split('@')[0]!.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        paymentProvider:  'stripe',
        externalSubId:    (session.subscription as string) ?? '',
        plan,
        seatCount:        seats,
        trialEndsAt:      trialEnd,
        stripeCustomerId: session.customer as string | null,
      })
      sendWelcomeEmail({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }

    case 'invoice.paid': {
      const invoice = event.data.object as Stripe.Invoice
      const id      = await tenantIdBySubId((invoice.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      const id      = await tenantIdBySubId((invoice.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const id  = await tenantIdBySubId(sub.id)
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }

    case 'customer.subscription.updated': {
      const sub      = event.data.object as Stripe.Subscription
      const tenantId = await tenantIdBySubId(sub.id)
      if (!tenantId) break
      const updates: Record<string, unknown> = {}
      if (sub.trial_end) updates['trialEndsAt'] = new Date(sub.trial_end * 1000)
      const qty = sub.items.data[0]?.quantity
      if (qty) updates['seatCount'] = qty
      if (Object.keys(updates).length) {
        await db.update(tenants).set(updates as Partial<typeof tenants.$inferInsert>).where(eq(tenants.id, tenantId))
      }
      break
    }
  }
}
