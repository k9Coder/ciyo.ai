import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { tenantsClient } from '../http/internal-client.js'
import { sendWelcomeEmail } from './email.js'

export async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export interface ActivateInput {
  name:             string
  paymentProvider:  'stripe' | 'paypal' | null
  externalSubId:    string | null
  plan:             'free' | 'starter' | 'business' | 'enterprise' | 'pilot'
  seatCount:        number
  trialEndsAt?:     Date | null
  stripeCustomerId?: string | null
}

export interface ActivateResult {
  tenantId:   string
  orgToken:   string
  adminToken: string
}

export async function activateTenant(input: ActivateInput): Promise<ActivateResult> {
  // Idempotency guard: if this externalSubId was already activated (e.g. Stripe/PayPal
  // retries the webhook), skip insertion and return a sentinel indicating the tenant
  // already exists. Callers should not re-send a welcome email in this case.
  if (input.externalSubId) {
    const existing = await tenantIdBySubId(input.externalSubId)
    if (existing) {
      // Tenant already activated — return a result without new plaintext tokens
      // (tokens were already sent on first activation; we cannot recover them).
      return {
        tenantId:   existing,
        orgToken:   '',   // already sent on first activation
        adminToken: '',   // already sent on first activation
      }
    }
  }

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()

  const [row] = await db.insert(tenants).values({
    name:               input.name,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    input.paymentProvider,
    externalSubId:      input.externalSubId,
    subscriptionStatus: 'active',
    plan:               input.plan,
    seatCount:          input.seatCount,
    trialEndsAt:        input.trialEndsAt ?? null,
    stripeCustomerId:   input.stripeCustomerId ?? null,
  }).returning({ id: tenants.id })

  const tenantId   = row!.id
  const orgToken   = formatToken('ps_live', tenantId, orgSecret)
  const adminToken = formatToken('ps_adm',  tenantId, adminSecret)

  return { tenantId, orgToken, adminToken }
}

export async function freeTierSignup(input: {
  name:  string
  email: string
}): Promise<ActivateResult> {
  const result = await activateTenant({
    name:            input.name,
    paymentProvider: null,
    externalSubId:   null,
    plan:            'free',
    seatCount:       1,
  })
  sendWelcomeEmail({
    to:         input.email,
    tenantName: input.name,
    orgToken:   result.orgToken,
    adminToken: result.adminToken,
  }).catch(() => {})
  return result
}

export async function updateSubscriptionStatus(tenantId: string, status: string): Promise<void> {
  await tenantsClient.patch(`/${tenantId}/subscription`, { status })
}
