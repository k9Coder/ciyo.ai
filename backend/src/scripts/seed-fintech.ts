/**
 * Fintech demo seed for "Yarin's Organization" (FinCorp).
 * Run: npm run seed:fintech
 *
 * Safe to re-run — clears existing divisions/teams/members/subjects/rules
 * for the tenant and rebuilds from scratch, preserving your admin clerkId
 * so Clerk auth keeps working after seeding.
 *
 * Creates Clerk user accounts for each dummy member (no org membership needed).
 * Sign in via the extension using email + password: Fincorp2026!
 */

import { createClerkClient } from '@clerk/backend'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, users, members, memberTeams,
  subjects, rules, siteConfigs, events, scans, invites,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'
import { publishPolicy } from '../policy/service.js'

const ADMIN_EMAIL    = 'yarin0600@gmail.com'
const DUMMY_PASSWORD = 'Fincorp2026!'

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type RuleSeed = {
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords?: string[]
  pattern?: string
  action: 'warn' | 'block'
  message: string
  reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
}

async function addSubject(
  tenantId: string,
  name: string,
  description: string,
  divisionId: string | null,
  teamId: string | null,
  ruleDefs: RuleSeed[],
) {
  const [s] = await db
    .insert(subjects)
    .values({ tenantId, name, description, divisionId, teamId })
    .returning({ id: subjects.id })
  for (const r of ruleDefs) {
    await db.insert(rules).values({
      tenantId,
      subjectId: s!.id,
      kind:      r.kind,
      keywords:  r.keywords ?? null,
      pattern:   r.pattern  ?? null,
      action:    r.action,
      message:   r.message,
      reportLevel: r.reportLevel,
    })
  }
  return s!.id
}

async function main() {
  // 1. Initialise Clerk client (used only for user creation — no org API calls)
  const clerkSecretKey = process.env['CLERK_SECRET_KEY']
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set in .env')
  const clerk = createClerkClient({ secretKey: clerkSecretKey })

  // 2. Find or create tenant
  //    Priority: users row by admin email → members row → first tenant → create fresh
  let tenantId: string
  let adminUserId: string
  let adminClerkId: string | null = null

  // Look up admin in our DB first
  const [adminUserRow] = await db.select({ id: users.id, clerkId: users.clerkId })
    .from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)

  if (adminUserRow) {
    adminUserId   = adminUserRow.id
    adminClerkId  = adminUserRow.clerkId ?? null
    const [adminMemberRow] = await db.select({ tenantId: members.tenantId })
      .from(members).where(eq(members.userId, adminUserRow.id)).limit(1)
    if (adminMemberRow) {
      tenantId = adminMemberRow.tenantId
      // Rename to FinCorp in case this tenant was auto-provisioned with a different name/slug
      await db.update(tenants)
        .set({ name: 'FinCorp', slug: 'fincorp' })
        .where(eq(tenants.id, tenantId))
    } else {
      // User exists but has no tenant yet — create one
      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()
      const [newTenant] = await db.insert(tenants).values({
        name: 'FinCorp',
        slug: 'fincorp',
        orgTokenHash:       await hashToken(orgSecret),
        adminTokenHash:     await hashToken(adminSecret),
        paymentProvider:    'stripe',
        externalSubId:      'sub_seed_fintech',
        subscriptionStatus: 'active',
      }).returning({ id: tenants.id })
      tenantId = newTenant!.id
      console.log(`  org token:   ${formatToken('ps_live', 'fincorp', orgSecret)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  'fincorp', adminSecret)}`)
    }
  } else {
    // No user row yet — look up admin Clerk user to get their clerkId
    console.log('  No admin in DB — looking up Clerk user for admin email…')
    const clerkUsers = await clerk.users.getUserList({ emailAddress: [ADMIN_EMAIL] })
    const adminClerkUser = clerkUsers.data[0]
    if (!adminClerkUser) throw new Error(`No Clerk user found for ${ADMIN_EMAIL} — sign up first.`)
    adminClerkId = adminClerkUser.id

    // Create or find tenant
    const [existingTenant] = await db.select({ id: tenants.id }).from(tenants).limit(1)
    if (existingTenant) {
      tenantId = existingTenant.id
    } else {
      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()
      const [newTenant] = await db.insert(tenants).values({
        name: 'FinCorp',
        slug: 'fincorp',
        orgTokenHash:       await hashToken(orgSecret),
        adminTokenHash:     await hashToken(adminSecret),
        paymentProvider:    'stripe',
        externalSubId:      'sub_seed_fintech',
        subscriptionStatus: 'active',
      }).returning({ id: tenants.id })
      tenantId = newTenant!.id
      console.log(`  org token:   ${formatToken('ps_live', 'fincorp', orgSecret)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  'fincorp', adminSecret)}`)
    }

    // Create users row for admin
    const [newAdminUser] = await db.insert(users).values({
      clerkId:   adminClerkId,
      email:     ADMIN_EMAIL,
      firstName: adminClerkUser.firstName ?? undefined,
      lastName:  adminClerkUser.lastName  ?? undefined,
    }).onConflictDoNothing().returning({ id: users.id })
    adminUserId = newAdminUser!.id
  }

  console.log(`✓ Tenant ${tenantId} (admin clerkId: ${adminClerkId ?? 'none'})`)

  // 3. Clear existing seed data for this tenant (preserve tenant row + policies + users)
  await db.delete(invites).where(eq(invites.tenantId, tenantId))
  await db.delete(events).where(eq(events.tenantId, tenantId))
  await db.delete(scans).where(eq(scans.tenantId, tenantId))

  const existingMembers = await db.select({ id: members.id }).from(members).where(eq(members.tenantId, tenantId))
  if (existingMembers.length > 0) {
    await db.delete(memberTeams).where(inArray(memberTeams.memberId, existingMembers.map(m => m.id)))
  }
  await db.delete(rules).where(eq(rules.tenantId, tenantId))
  await db.delete(subjects).where(eq(subjects.tenantId, tenantId))
  await db.delete(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
  await db.delete(members).where(eq(members.tenantId, tenantId))
  await db.delete(teams).where(eq(teams.tenantId, tenantId))
  await db.delete(divisions).where(eq(divisions.tenantId, tenantId))
  console.log('✓ Cleared existing seed data')

  // 4. Re-create the admin member
  const [adminMember] = await db
    .insert(members)
    .values({ tenantId, userId: adminUserId, email: ADMIN_EMAIL, displayName: 'Yarin', role: 'super_admin' })
    .returning({ id: members.id })
  void adminMember

  // 5. Divisions
  const divRows = await db
    .insert(divisions)
    .values([
      { tenantId, name: 'Research & Development', slug: 'rd'       },
      { tenantId, name: 'Legal & Compliance',     slug: 'legal'    },
      { tenantId, name: 'Finance',                slug: 'finance'  },
      { tenantId, name: 'Product',                slug: 'product'  },
      { tenantId, name: 'Security',               slug: 'security' },
    ])
    .returning({ id: divisions.id, slug: divisions.slug })

  const div = Object.fromEntries(divRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 5 divisions: R&D · Legal · Finance · Product · Security')

  // 6. Teams
  const teamDefs = [
    { divisionId: div['rd']!,       name: 'Core Platform',       slug: 'core-platform'    },
    { divisionId: div['rd']!,       name: 'Mobile',              slug: 'mobile'           },
    { divisionId: div['rd']!,       name: 'Data Engineering',    slug: 'data-engineering' },
    { divisionId: div['legal']!,    name: 'Regulatory Affairs',  slug: 'regulatory'       },
    { divisionId: div['legal']!,    name: 'Contract Review',     slug: 'contracts'        },
    { divisionId: div['legal']!,    name: 'Privacy & Data',      slug: 'privacy'          },
    { divisionId: div['finance']!,  name: 'Treasury',            slug: 'treasury'         },
    { divisionId: div['finance']!,  name: 'Financial Reporting', slug: 'reporting'        },
    { divisionId: div['finance']!,  name: 'Risk Management',     slug: 'risk'             },
    { divisionId: div['product']!,  name: 'Consumer Banking',    slug: 'consumer-banking' },
    { divisionId: div['product']!,  name: 'B2B Payments',        slug: 'b2b-payments'     },
    { divisionId: div['product']!,  name: 'Lending',             slug: 'lending'          },
    { divisionId: div['security']!, name: 'AppSec',              slug: 'appsec'           },
    { divisionId: div['security']!, name: 'Threat Intelligence', slug: 'threat-intel'     },
    { divisionId: div['security']!, name: 'Compliance & Audit',  slug: 'compliance'       },
  ]

  const teamRows = await db
    .insert(teams)
    .values(teamDefs.map(t => ({ tenantId, ...t })))
    .returning({ id: teams.id, slug: teams.slug })

  const team = Object.fromEntries(teamRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 15 teams')

  // 7. Dummy members — create Clerk users (for sign-in) + DB users + DB members
  const dummyDefs = [
    { email: 'alice.chen@fincorp.dev',     displayName: 'Alice Chen',     firstName: 'Alice',  lastName: 'Chen',    teamSlug: 'core-platform' },
    { email: 'marcus.johnson@fincorp.dev', displayName: 'Marcus Johnson', firstName: 'Marcus', lastName: 'Johnson', teamSlug: 'regulatory'    },
    { email: 'priya.patel@fincorp.dev',    displayName: 'Priya Patel',    firstName: 'Priya',  lastName: 'Patel',   teamSlug: 'treasury'      },
    { email: 'sarah.kim@fincorp.dev',      displayName: 'Sarah Kim',      firstName: 'Sarah',  lastName: 'Kim',     teamSlug: 'appsec'        },
  ]

  for (const m of dummyDefs) {
    // Find or create Clerk user (for extension sign-in)
    let clerkUserId: string
    const existing = await clerk.users.getUserList({ emailAddress: [m.email] })
    if (existing.data.length > 0) {
      clerkUserId = existing.data[0]!.id
      console.log(`  · ${m.email} — found existing Clerk user ${clerkUserId}`)
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [m.email],
        password: DUMMY_PASSWORD,
        firstName: m.firstName,
        lastName: m.lastName,
        skipPasswordChecks: true,
      })
      clerkUserId = created.id
      console.log(`  · ${m.email} — created Clerk user ${clerkUserId}`)
    }

    // Upsert users row
    const [userRow] = await db
      .insert(users)
      .values({ clerkId: clerkUserId, email: m.email, firstName: m.firstName, lastName: m.lastName })
      .onConflictDoNothing()
      .returning({ id: users.id })

    const userId = userRow?.id ?? (
      await db.select({ id: users.id }).from(users).where(eq(users.email, m.email)).limit(1)
    )[0]!.id

    // Insert member row referencing the users row
    const [row] = await db
      .insert(members)
      .values({ tenantId, userId, email: m.email, displayName: m.displayName, role: 'member' })
      .returning({ id: members.id })
    await db.insert(memberTeams).values({ memberId: row!.id, teamId: team[m.teamSlug]! })
  }
  console.log('✓ Created 4 dummy members in Clerk + DB (no org membership needed)')

  // 8. Subjects + Rules
  await addSubject(tenantId,
    'API Keys & Secrets',
    'Detects real credential formats — AWS keys, private key blocks, JWTs, Stripe keys, GitHub tokens.',
    null, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'AWS access key detected — never paste cloud credentials into AI assistants.',
        pattern: 'AKIA[0-9A-Z]{16}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Private key material detected — this must never leave secure storage.',
        pattern: '-----BEGIN\\s(?:RSA\\s|EC\\s|OPENSSH\\s)?PRIVATE KEY-----' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'JWT token detected — tokens grant access and should not be shared.',
        pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Stripe API key detected — live keys provide direct payment access.',
        pattern: 'sk_live_[A-Za-z0-9]{20,}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'GitHub token detected — this can read or write to our repositories.',
        pattern: 'gh[pousr]_[A-Za-z0-9_]{36,255}' },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Possible .env file content pasted — check for secrets before sending.',
        pattern: '(?:^|\\n)[A-Z][A-Z0-9_]{3,}=["\']?[^\\s"\']{12,}["\']?' },
    ]
  )

  await addSubject(tenantId,
    'Employee & Customer PII',
    'Stops SSNs, credit card numbers, and passport-style identifiers from reaching AI tools.',
    null, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'US Social Security Number detected — PII is prohibited in AI prompts.',
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — PCI-DSS prohibits sharing card data.',
        pattern: '\\b4[0-9]{12}(?:[0-9]{3})?\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — do not share payment card data.',
        pattern: '\\b5[1-5][0-9]{14}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — do not share payment card data.',
        pattern: '\\b3[47][0-9]{13}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Prompt references personal identifiers — confirm no real data is included.',
        keywords: ['date of birth', 'home address', 'health record', 'national insurance number'] },
    ]
  )

  console.log('✓ Created subjects with rules')

  // 9. Site configs
  await db.insert(siteConfigs).values([
    { tenantId, domain: 'chatgpt.com',           inputSelector: '#prompt-textarea',            sendButtonSelector: 'button[data-testid="send-button"]'  },
    { tenantId, domain: 'claude.ai',             inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send Message"]'  },
    { tenantId, domain: 'gemini.google.com',     inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send message"]'  },
    { tenantId, domain: 'copilot.microsoft.com', inputSelector: 'textarea#userInput',           sendButtonSelector: 'button[aria-label="Submit message"]' },
  ])
  console.log('✓ Created site configs for ChatGPT · Claude · Gemini · Copilot')

  // 10. Compile & publish policy
  const policyDoc = await compilePolicy(tenantId)
  const version   = await publishPolicy(tenantId, policyDoc)
  console.log(`✓ Published policy v${version}`)

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  FinCorp seed complete! (Clerk org-free)                   ║
╠════════════════════════════════════════════════════════════╣
║  5 divisions · 15 teams · 4 members · policy published     ║
╠════════════════════════════════════════════════════════════╣
║  Sign in to the extension as any member:                  ║
║  password → Fincorp2026!                                  ║
╠════════════════════════════════════════════════════════════╣`)
  for (const m of dummyDefs) {
    console.log(`║  ${m.email.padEnd(42)}  [${m.teamSlug.padEnd(16)}]  ║`)
  }
  console.log(`╚════════════════════════════════════════════════════════════╝`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
