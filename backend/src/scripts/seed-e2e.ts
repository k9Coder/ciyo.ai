// Load .env before ../db/client.js reads DATABASE_URL — dotenv is a devDependency,
// so runtime code (dist/db/client.js in the Docker image) must not import it.
import 'dotenv/config'
import path from 'path'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { requestContext } from '../context/request-context.js'
import {
  tenants, divisions, teams, users, members, memberTeams,
  subjects, rules, policies,
  destinationGroups, siteConfigs, events, scans,
  chatSessions, chatMessages, invites, enforcementSignals,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_STATE_PATH = path.resolve(__dirname, '../../../e2e/.seed-state.json')

async function main() {
  console.log('[seed-e2e] Truncating test DB...')
  await db.delete(enforcementSignals)
  await db.delete(invites)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
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
  await db.delete(users)

  console.log('[seed-e2e] Seeding test tenant...')

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()

  const [tenant] = await db.insert(tenants).values({
    name:               'E2E Test Org',
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      'sub_e2e_test',
    subscriptionStatus: 'active',
    plan:               'business',
    seatCount:          10,
    // The seeded user is the tenant's sole super_admin — TenantBootstrap redirects
    // any such admin to /onboarding/profile until this is true, which would send
    // every admin-suite test off to the wizard instead of the page under test.
    onboardingWizardCompleted: true,
  }).returning({ id: tenants.id })

  const tenantId = tenant!.id
  const orgToken   = formatToken('ps_live', tenantId, orgSecret)
  const adminToken = formatToken('ps_adm',  tenantId, adminSecret)

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

  // Create the users row so JWT-based auth works during E2E tests
  const [e2eUser] = await db.insert(users).values({
    clerkId: process.env.E2E_CLERK_USER_ID!,
    email:   process.env.E2E_CLERK_USER_EMAIL!,
  }).returning({ id: users.id })

  const [member] = await db.insert(members).values({
    tenantId,
    userId: e2eUser!.id,
    email:  process.env.E2E_CLERK_USER_EMAIL!,
    role:   'super_admin',
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

  const policyJson = await requestContext.run(
    { traceId: randomUUID(), tenantId, isM2M: true },
    () => compilePolicy(tenantId),
  )
  await db.insert(policies).values({
    tenantId,
    version:     1,
    policyJson,
    publishedAt: new Date(),
  })

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

  const [chatSession1] = await db.insert(chatSessions).values({
    tenantId,
    memberId: member!.id,
    title:    'E2E Assistant API Test Session',
  }).returning({ id: chatSessions.id })

  const [chatMessage1] = await db.insert(chatMessages).values({
    sessionId:   chatSession1!.id,
    role:        'assistant',
    content:     'I can add a keyword rule to block E2E_API_RULE.',
    actionsJson: [
      {
        op:          'create_rule',
        subjectId:   subject!.id,
        kind:        'keyword',
        keywords:    ['E2E_API_RULE'],
        action:      'block',
        reportLevel: 'medium',
      },
    ],
  }).returning({ id: chatMessages.id })

  const [chatSession2] = await db.insert(chatSessions).values({
    tenantId,
    memberId: member!.id,
    title:    'E2E Assistant Full-Flow Test Session',
  }).returning({ id: chatSessions.id })

  const [chatMessage2] = await db.insert(chatMessages).values({
    sessionId:   chatSession2!.id,
    role:        'assistant',
    content:     'I can add a keyword rule to block E2E_AI_FLOW.',
    actionsJson: [
      {
        op:          'create_rule',
        subjectId:   subject!.id,
        kind:        'keyword',
        keywords:    ['E2E_AI_FLOW'],
        action:      'block',
        reportLevel: 'medium',
      },
    ],
  }).returning({ id: chatMessages.id })

  // ── Free-tier tenant for billing limit tests ─────────────────────────────
  const freeOrgSecret   = generateSecret()
  const freeAdminSecret = generateSecret()

  const [freeTenant] = await db.insert(tenants).values({
    name:               'E2E Free Org',
    orgTokenHash:       await hashToken(freeOrgSecret),
    adminTokenHash:     await hashToken(freeAdminSecret),
    paymentProvider:    null,
    externalSubId:      null,
    subscriptionStatus: 'active',
    plan:               'free',
    seatCount:          1,
  }).returning({ id: tenants.id })

  const freeTenantId  = freeTenant!.id
  const freeOrgToken   = formatToken('ps_live', freeTenantId, freeOrgSecret)
  const freeAdminToken = formatToken('ps_adm',  freeTenantId, freeAdminSecret)

  // Seed 3 members (free plan allows 3)
  const freeUsers = await db.insert(users).values([
    { clerkId: 'free_user_1', email: 'free1@example.com' },
    { clerkId: 'free_user_2', email: 'free2@example.com' },
    { clerkId: 'free_user_3', email: 'free3@example.com' },
  ]).returning({ id: users.id })

  await db.insert(members).values(
    freeUsers.map((u, i) => ({
      tenantId: freeTenantId,
      userId:   u.id,
      email:    `free${i + 1}@example.com`,
      role:     'member' as const,
    }))
  )

  // Seed 500 scans (at the free plan limit)
  const scanStart = new Date()
  scanStart.setUTCDate(1)
  scanStart.setUTCHours(0, 0, 0, 0)
  await db.insert(scans).values(
    Array.from({ length: 500 }, (_, i) => ({
      tenantId:   freeTenantId,
      memberId:   null,
      occurredAt: new Date(scanStart.getTime() + i * 1000),
    }))
  )

  const [chatSession3] = await db.insert(chatSessions).values({
    tenantId,
    memberId: member!.id,
    title:    'E2E Org Management Test Session',
  }).returning({ id: chatSessions.id })

  const [chatMessage3] = await db.insert(chatMessages).values({
    sessionId:   chatSession3!.id,
    role:        'assistant',
    content:     'I will create the E2E Legal division.',
    actionsJson: [
      { op: 'create_division', name: 'E2E Legal' },
    ],
  }).returning({ id: chatMessages.id })

  const seedState = {
    tenantId,
    orgToken,
    adminToken,
    assistantSessionId:      chatSession1!.id,
    assistantMessageId:      chatMessage1!.id,
    assistantFlowMessageId:  chatMessage2!.id,
    assistantOrgMessageId:   chatMessage3!.id,
    freeTenantId,
    freeOrgToken,
    freeAdminToken,
  }
  writeFileSync(SEED_STATE_PATH, JSON.stringify(seedState, null, 2))
  console.log('[seed-e2e] Done. Seed state written to', SEED_STATE_PATH)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
