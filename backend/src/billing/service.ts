import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'
import { sendWelcomeEmail } from './email.js'

export interface ActivateInput {
  name:             string
  slug:             string
  paymentProvider:  'stripe' | 'paypal' | null
  externalSubId:    string | null
  plan:             'free' | 'starter' | 'business' | 'enterprise'
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
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', input.slug, orgSecret)
  const adminToken  = formatToken('ps_adm',  input.slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name:             input.name,
    slug:             input.slug,
    orgTokenHash:     await hashToken(orgSecret),
    adminTokenHash:   await hashToken(adminSecret),
    paymentProvider:  input.paymentProvider,
    externalSubId:    input.externalSubId,
    subscriptionStatus: 'active',
    plan:             input.plan,
    seatCount:        input.seatCount,
    trialEndsAt:      input.trialEndsAt ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export async function freeTierSignup(input: {
  name:  string
  slug:  string
  email: string
}): Promise<ActivateResult> {
  const result = await activateTenant({
    name:            input.name,
    slug:            input.slug,
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

export { updateSubscriptionStatus }
