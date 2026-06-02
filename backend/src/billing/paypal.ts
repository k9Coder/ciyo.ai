import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'

const PAYPAL_API = process.env['PAYPAL_SANDBOX'] === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com'

async function getAccessToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env['PAYPAL_CLIENT_ID']}:${process.env['PAYPAL_CLIENT_SECRET']}`
  ).toString('base64')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function createPayPalSubscriptionUrl(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  tenantSlug: string
  email:      string
}): Promise<{ url: string }> {
  const token   = await getAccessToken()
  const planId  = opts.plan === 'business'
    ? process.env['PAYPAL_BUSINESS_PLAN_ID']!
    : process.env['PAYPAL_STARTER_PLAN_ID']!
  const customId = `${opts.tenantSlug}|${opts.tenantName}|${opts.email}|${opts.plan}|${opts.seatCount}`

  const res = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id:   planId,
      quantity:  String(opts.seatCount),
      custom_id: customId,
      subscriber: { email_address: opts.email },
      application_context: {
        return_url: process.env['PAYPAL_RETURN_URL'] ?? 'https://ciyo.ai/welcome',
        cancel_url: process.env['PAYPAL_CANCEL_URL'] ?? 'https://ciyo.ai/pricing',
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  })
  const sub = await res.json() as { links: Array<{ rel: string; href: string }> }
  const approvalLink = sub.links.find(l => l.rel === 'approve')
  if (!approvalLink) throw new Error('PayPal did not return an approval link')
  return { url: approvalLink.href }
}

function parseCustomId(raw: string): {
  slug: string; name: string; email: string
  plan: 'starter' | 'business'; seatCount: number
} | null {
  const [slug, name, email, plan, seats] = raw.split('|')
  if (!slug || !name || !email) return null
  return {
    slug,
    name,
    email,
    plan:      (plan as 'starter' | 'business') ?? 'business',
    seatCount: parseInt(seats ?? '1', 10),
  }
}

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handlePayPalEvent(body: Record<string, unknown>): Promise<void> {
  const eventType = body['event_type'] as string
  const resource  = body['resource'] as Record<string, unknown>

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const parsed = parseCustomId((resource['custom_id'] as string) ?? '')
      if (!parsed) return
      const result = await activateTenant({
        name:            parsed.name,
        slug:            parsed.slug,
        paymentProvider: 'paypal',
        externalSubId:   (resource['id'] as string) ?? '',
        plan:            parsed.plan,
        seatCount:       parsed.seatCount,
      })
      sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }

    case 'PAYMENT.SALE.COMPLETED': {
      const id = await tenantIdBySubId((resource['billing_agreement_id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }

    case 'BILLING.SUBSCRIPTION.CANCELLED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }

    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }
  }
}
