import Stripe from 'stripe'
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { eq } from 'drizzle-orm'

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!)
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const meta = session.metadata ?? {}
      const email = session.customer_email ?? ''
      const result = await activateTenant({
        name: meta['tenantName'] ?? email,
        slug: meta['tenantSlug'] ?? email.split('@')[0]!.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        paymentProvider: 'stripe',
        externalSubId: (session.subscription as string) ?? '',
      })
      sendWelcomeEmail({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice
      const id = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      const id = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const id = await tenantIdBySubId(sub.id)
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }
  }
}
