import path from 'path'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, members, memberTeams,
  subjects, rules, policies,
  destinationGroups, siteConfigs, events, scans,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_STATE_PATH = path.resolve(__dirname, '../../../../e2e/.seed-state.json')

async function main() {
  console.log('[seed-e2e] Truncating test DB...')
  await db.delete(events)
  await db.delete(scans)
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

  console.log('[seed-e2e] Seeding test tenant...')

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', 'e2e-tenant', orgSecret)
  const adminToken  = formatToken('ps_adm',  'e2e-tenant', adminSecret)

  const [tenant] = await db.insert(tenants).values({
    name:               'E2E Test Org',
    slug:               'e2e-tenant',
    clerkOrgId:         process.env.E2E_CLERK_ORG_ID!,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      'sub_e2e_test',
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  const tenantId = tenant!.id

  const [division] = await db.insert(divisions).values({
    tenantId,
    name: 'E2E Division',
    slug: 'e2e-division',
  }).returning({ id: divisions.id })

  const [team] = await db.insert(teams).values({
    tenantId,
    divisionId: division!.id,
    name: 'E2E Team',
    slug: 'e2e-team',
  }).returning({ id: teams.id })

  const [member] = await db.insert(members).values({
    tenantId,
    email:   process.env.E2E_CLERK_USER_EMAIL!,
    clerkId: process.env.E2E_CLERK_USER_ID!,
    role:    'super_admin',
  }).returning({ id: members.id })

  await db.insert(memberTeams).values({ memberId: member!.id, teamId: team!.id })

  const [subject] = await db.insert(subjects).values({
    tenantId,
    name:   'ACME Confidential',
    active: true,
  }).returning({ id: subjects.id })

  await db.insert(rules).values([
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_SECRET'],
      action:      'block',
      active:      true,
      reportLevel: 'medium',
    },
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_WARN'],
      action:      'warn',
      active:      true,
      reportLevel: 'medium',
    },
  ])

  const policyJson = await compilePolicy(tenantId)
  await db.insert(policies).values({
    tenantId,
    version:     1,
    policyJson,
    publishedAt: new Date(),
  })

  // Seed 15 audit events (8 block + 7 warn) so audit.spec.ts has data for filters/pagination
  const ruleRows = await db
    .select({ id: rules.id, action: rules.action })
    .from(rules)
    .where(eq(rules.tenantId, tenantId))

  const blockRuleId = ruleRows.find(r => r.action === 'block')!.id
  const warnRuleId  = ruleRows.find(r => r.action === 'warn')!.id
  const now = new Date()

  await db.insert(events).values([
    ...Array.from({ length: 8 }, (_, i) => ({
      tenantId,
      ruleId:      blockRuleId,
      memberId:    member!.id,
      action:      'block' as const,
      siteUrl:     'https://chatgpt.com/',
      matchedTerm: 'ACME_SECRET',
      occurredAt:  new Date(now.getTime() - i * 60_000),
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      tenantId,
      ruleId:      warnRuleId,
      memberId:    member!.id,
      action:      'warn' as const,
      siteUrl:     'https://claude.ai/',
      matchedTerm: 'ACME_WARN',
      occurredAt:  new Date(now.getTime() - (8 + i) * 60_000),
    })),
  ])

  const seedState = { tenantId, orgToken, adminToken }
  writeFileSync(SEED_STATE_PATH, JSON.stringify(seedState, null, 2))
  console.log('[seed-e2e] Done. Seed state written to', SEED_STATE_PATH)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
