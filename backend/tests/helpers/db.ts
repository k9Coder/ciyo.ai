import { db } from '../../src/db/client.js'
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules,
         destinationGroups, siteConfigs, events, scans,
         chatMessages, chatSessions } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(events)
  await db.delete(scans)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
}

export interface TestTenantResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function buildTestTenant(slug = 'testfirm'): Promise<TestTenantResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', slug, orgSecret)
  const adminToken  = formatToken('ps_adm', slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name:               'Test Firm LLP',
    slug,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      `sub_test_${slug}`,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export async function buildTestMember(tenantId: string, clerkId = 'clerk_test_user'): Promise<string> {
  const [row] = await db.insert(members).values({
    tenantId,
    email:   `${clerkId}@test.com`,
    clerkId,
    role:    'member',
  }).returning({ id: members.id })
  return row!.id
}
