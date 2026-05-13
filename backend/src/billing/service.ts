import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'

export interface ActivateInput {
  name: string
  slug: string
  paymentProvider: 'stripe' | 'paypal'
  externalSubId: string
}

export interface ActivateResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function activateTenant(input: ActivateInput): Promise<ActivateResult> {
  const orgSecret = generateSecret()
  const adminSecret = generateSecret()
  const orgToken = formatToken('ps_live', input.slug, orgSecret)
  const adminToken = formatToken('ps_adm', input.slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name: input.name,
    slug: input.slug,
    orgTokenHash: await hashToken(orgSecret),
    adminTokenHash: await hashToken(adminSecret),
    paymentProvider: input.paymentProvider,
    externalSubId: input.externalSubId,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export { updateSubscriptionStatus }
