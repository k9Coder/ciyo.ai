import { db } from '../../src/db/client.js'
import { tenants, policies, matters } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(matters)
  await db.delete(policies)
  await db.delete(tenants)
}

export interface TestTenantResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function buildTestTenant(slug = 'testfirm'): Promise<TestTenantResult> {
  const orgSecret = generateSecret()
  const adminSecret = generateSecret()
  const orgToken = formatToken('ps_live', slug, orgSecret)
  const adminToken = formatToken('ps_adm', slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name: 'Test Firm LLP',
    slug,
    orgTokenHash: await hashToken(orgSecret),
    adminTokenHash: await hashToken(adminSecret),
    paymentProvider: 'stripe',
    externalSubId: `sub_test_${slug}`,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}
