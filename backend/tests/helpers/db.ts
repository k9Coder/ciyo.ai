import { db } from '../../src/db/client.js'
import {
  tenants, policies, divisions, teams, users, members, memberTeams,
  subjects, rules, subjectVersions, destinationGroups, siteConfigs, events, scans,
  enforcementSignals, chatMessages, chatSessions, invites, desktopAuthCodes, deviceTokens,
} from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'
import type { User } from '../../src/db/schema.js'

export async function truncateAll(): Promise<void> {
  await db.delete(events)
  await db.delete(enforcementSignals)
  await db.delete(scans)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(invites)
  await db.delete(deviceTokens)
  await db.delete(desktopAuthCodes)
  await db.delete(memberTeams)
  await db.delete(subjectVersions)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
  await db.delete(users)
}

export interface TestTenantResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function buildTestTenant(nameSuffix?: string): Promise<TestTenantResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const suffix = nameSuffix ?? Math.random().toString(36).slice(2, 8)

  const [row] = await db.insert(tenants).values({
    name:               `Test Firm ${suffix}`,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      `sub_test_${suffix}`,
    subscriptionStatus: 'active',
    plan:               'business',
    seatCount:          10,
  }).returning({ id: tenants.id })

  const tenantId  = row!.id
  const orgToken   = formatToken('ps_live', tenantId, orgSecret)
  const adminToken = formatToken('ps_adm',  tenantId, adminSecret)

  return { tenantId, orgToken, adminToken }
}

export async function buildTestUser(clerkId = 'clerk_test_user', email?: string): Promise<User> {
  const [row] = await db.insert(users).values({
    clerkId,
    email: email ?? `${clerkId}@test.com`,
  }).returning()
  return row!
}

export async function buildTestMember(tenantId: string, user: User): Promise<string> {
  const [row] = await db.insert(members).values({
    tenantId,
    userId: user.id,
    email:  user.email,
    role:   'member',
  }).returning({ id: members.id })
  return row!.id
}
