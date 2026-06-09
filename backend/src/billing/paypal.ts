import { createHmac } from 'node:crypto'
import { activateTenant, updateSubscriptionStatus, tenantIdBySubId } from './service.js'
import { sendWelcomeEmail } from './email.js'
import { logger } from '../logger/index.js'

const PAYPAL_API = process.env['PAYPAL_SANDBOX'] === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com'

async function getAccessToken(): Promise<string> {
  const clientId     = process.env['PAYPAL_CLIENT_ID']
  const clientSecret = process.env['PAYPAL_CLIENT_SECRET']
  if (!clientId || !clientSecret) {
    throw new Error('PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET env vars are required')
  }
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export interface PayPalWebhookHeaders {
  transmissionId:   string
  transmissionTime: string
  certUrl:          string
  transmissionSig:  string
}

/**
 * Verify PayPal webhook signature using PayPal's webhook verification API.
 * PayPal provides PAYPAL-TRANSMISSION-ID, PAYPAL-TRANSMISSION-TIME,
 * PAYPAL-CERT-URL, and PAYPAL-TRANSMISSION-SIG headers for this purpose.
 *
 * In test mode (PAYPAL_SKIP_SIG_VERIFY=true), verification is bypassed.
 * This flag must never be set in production.
 */
export async function verifyPayPalWebhookSignature(
  rawBody: string,
  headers: PayPalWebhookHeaders,
): Promise<boolean> {
  // Test-mode escape hatch — only allowed when NODE_ENV !== 'production'
  if (process.env['PAYPAL_SKIP_SIG_VERIFY'] === 'true') {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('PAYPAL_SKIP_SIG_VERIFY must not be set in production')
    }
    return true
  }

  const webhookId = process.env['PAYPAL_WEBHOOK_ID']
  if (!webhookId) {
    throw new Error('PAYPAL_WEBHOOK_ID env var is required for webhook signature verification')
  }

  try {
    const token = await getAccessToken()
    const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        transmission_id:   headers.transmissionId,
        transmission_time: headers.transmissionTime,
        cert_url:          headers.certUrl,
        auth_algo:         'SHA256withRSA',
        transmission_sig:  headers.transmissionSig,
        webhook_id:        webhookId,
        webhook_event:     JSON.parse(rawBody),
      }),
    })

    if (!res.ok) {
      logger.warn('PayPal webhook verification API returned non-OK status', { status: res.status })
      return false
    }

    const data = await res.json() as { verification_status: string }
    return data.verification_status === 'SUCCESS'
  } catch (err) {
    logger.error('PayPal webhook signature verification failed', { err })
    return false
  }
}

export async function createPayPalSubscriptionUrl(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  email:      string
}): Promise<{ url: string }> {
  const token   = await getAccessToken()
  const planId  = opts.plan === 'business'
    ? process.env['PAYPAL_BUSINESS_PLAN_ID']!
    : process.env['PAYPAL_STARTER_PLAN_ID']!
  const customId = `${opts.tenantName}|${opts.email}|${opts.plan}|${opts.seatCount}`

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
  const approvalLink = sub.links.find(link => link.rel === 'approve')
  if (!approvalLink) throw new Error('PayPal did not return an approval link')
  return { url: approvalLink.href }
}

function parseCustomId(raw: string): {
  name: string; email: string
  plan: 'starter' | 'business'; seatCount: number
} | null {
  const [name, email, plan, seats] = raw.split('|')
  if (!name || !email) return null
  return {
    name,
    email,
    plan:      (plan as 'starter' | 'business') ?? 'business',
    seatCount: parseInt(seats ?? '1', 10),
  }
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
        paymentProvider: 'paypal',
        externalSubId:   (resource['id'] as string) ?? '',
        plan:            parsed.plan,
        seatCount:       parsed.seatCount,
      })
      // Only send welcome email on first activation (idempotency: empty tokens mean already activated)
      if (result.orgToken) {
        sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      }
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
