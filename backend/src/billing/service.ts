import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'
import { sendWelcomeEmail } from './email.js'

export async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export interface ActivateInput {
  name:             string
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

  const tenantId  = row!.id
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

export { updateSubscriptionStatus }
