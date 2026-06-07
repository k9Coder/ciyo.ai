/**
 * FinCorp demo seed — rich live-looking dataset.
 *
 * Generates:
 *   15 members across 5 divisions / 15 teams
 *   11 subjects with 42 rules
 *   ~780 historical scans + ~80 threat events (last 30 days)
 *
 * Safe to re-run — clears and rebuilds from scratch each time.
 * All dummy accounts share password: Fincorp2026!
 */

import { createClerkClient } from '@clerk/backend'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, users, members, memberTeams,
  subjects, rules, siteConfigs, events, scans, invites,
  chatSessions, chatMessages,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'
import { publishPolicy } from '../policy/service.js'

const ADMIN_EMAIL    = 'yarin0600@gmail.com'
const DUMMY_PASSWORD = 'Fincorp2026!'

// ── Deterministic PRNG (xorshift32) so re-seeds produce identical data ────────
function makeRng(seed: number) {
  let s = seed >>> 0
  return (): number => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5
    return (s >>> 0) / 0x100000000
  }
}
const rng = makeRng(20240603)

function ri(min: number, max: number) { return min + Math.floor(rng() * (max - min + 1)) }
function pick<T>(arr: T[]): T { return arr[Math.floor(rng() * arr.length)]! }

function pastDate(maxDaysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - ri(0, maxDaysAgo))
  d.setHours(ri(8, 18), ri(0, 59), ri(0, 59), 0)
  return d
}

// ── Rule / subject builder ────────────────────────────────────────────────────
type RuleSeed = {
  kind:        'keyword' | 'pattern' | 'entropy' | 'score'
  keywords?:   string[]
  pattern?:    string
  action:      'warn' | 'block'
  message:     string
  reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
}

async function addSubject(
  tenantId: string, name: string, description: string,
  divisionId: string | null, teamId: string | null,
  ruleDefs: RuleSeed[],
): Promise<{ subjectId: string; ruleIds: string[] }> {
  const [s] = await db.insert(subjects)
    .values({ tenantId, name, description, divisionId, teamId })
    .returning({ id: subjects.id })
  const ruleIds: string[] = []
  for (const r of ruleDefs) {
    const [row] = await db.insert(rules).values({
      tenantId, subjectId: s!.id,
      kind: r.kind, keywords: r.keywords ?? null, pattern: r.pattern ?? null,
      action: r.action, message: r.message, reportLevel: r.reportLevel,
    }).returning({ id: rules.id })
    ruleIds.push(row!.id)
  }
  return { subjectId: s!.id, ruleIds }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const clerkSecretKey = process.env['CLERK_SECRET_KEY']
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set in .env')
  const clerk = createClerkClient({ secretKey: clerkSecretKey })

  // ── 1. Find or create tenant ────────────────────────────────────────────────
  let tenantId: string
  let adminUserId: string
  let adminClerkId: string | null = null

  const [adminUserRow] = await db.select({ id: users.id, clerkId: users.clerkId })
    .from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)

  if (adminUserRow) {
    adminUserId  = adminUserRow.id
    adminClerkId = adminUserRow.clerkId ?? null
    const [adminMemberRow] = await db.select({ tenantId: members.tenantId })
      .from(members).where(eq(members.userId, adminUserRow.id)).limit(1)
    if (adminMemberRow) {
      tenantId = adminMemberRow.tenantId
      await db.update(tenants)
        .set({ name: 'FinCorp', plan: 'business', seatCount: 50 })
        .where(eq(tenants.id, tenantId))
    } else {
      const os = generateSecret(), as_ = generateSecret()
      const [t] = await db.insert(tenants).values({
        name: 'FinCorp',
        orgTokenHash: await hashToken(os), adminTokenHash: await hashToken(as_),
        paymentProvider: 'stripe', externalSubId: 'sub_seed_fintech',
        subscriptionStatus: 'active', plan: 'business', seatCount: 50,
      }).returning({ id: tenants.id })
      tenantId = t!.id
      console.log(`  org token:   ${formatToken('ps_live', tenantId, os)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  tenantId, as_)}`)
    }
  } else {
    console.log('  No admin in DB — looking up Clerk user…')
    const clerkUsers = await clerk.users.getUserList({ emailAddress: [ADMIN_EMAIL] })
    const cu = clerkUsers.data[0]
    if (!cu) throw new Error(`No Clerk user for ${ADMIN_EMAIL} — sign up first.`)
    adminClerkId = cu.id

    const [existing] = await db.select({ id: tenants.id }).from(tenants).limit(1)
    if (existing) {
      tenantId = existing.id
    } else {
      const os = generateSecret(), as_ = generateSecret()
      const [t] = await db.insert(tenants).values({
        name: 'FinCorp',
        orgTokenHash: await hashToken(os), adminTokenHash: await hashToken(as_),
        paymentProvider: 'stripe', externalSubId: 'sub_seed_fintech',
        subscriptionStatus: 'active', plan: 'business', seatCount: 50,
      }).returning({ id: tenants.id })
      tenantId = t!.id
      console.log(`  org token:   ${formatToken('ps_live', tenantId, os)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  tenantId, as_)}`)
    }
    const [nu] = await db.insert(users).values({
      clerkId: adminClerkId, email: ADMIN_EMAIL,
      firstName: cu.firstName ?? undefined, lastName: cu.lastName ?? undefined,
    }).onConflictDoNothing().returning({ id: users.id })
    adminUserId = nu!.id
  }

  console.log(`✓ Tenant ${tenantId}`)

  // ── 2. Clear ─────────────────────────────────────────────────────────────────
  await db.delete(invites).where(eq(invites.tenantId, tenantId))
  await db.delete(events).where(eq(events.tenantId, tenantId))
  await db.delete(scans).where(eq(scans.tenantId, tenantId))
  const existingSessions = await db.select({ id: chatSessions.id })
    .from(chatSessions).where(eq(chatSessions.tenantId, tenantId))
  if (existingSessions.length > 0)
    await db.delete(chatMessages).where(inArray(chatMessages.sessionId, existingSessions.map(s => s.id)))
  await db.delete(chatSessions).where(eq(chatSessions.tenantId, tenantId))
  const existingMembers = await db.select({ id: members.id }).from(members).where(eq(members.tenantId, tenantId))
  if (existingMembers.length > 0)
    await db.delete(memberTeams).where(inArray(memberTeams.memberId, existingMembers.map(m => m.id)))
  await db.delete(rules).where(eq(rules.tenantId, tenantId))
  await db.delete(subjects).where(eq(subjects.tenantId, tenantId))
  await db.delete(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
  await db.delete(members).where(eq(members.tenantId, tenantId))
  await db.delete(teams).where(eq(teams.tenantId, tenantId))
  await db.delete(divisions).where(eq(divisions.tenantId, tenantId))
  console.log('✓ Cleared existing data')

  // ── 3. Admin member ──────────────────────────────────────────────────────────
  await db.insert(members).values({
    tenantId, userId: adminUserId, email: ADMIN_EMAIL,
    displayName: 'Yarin (Admin)', role: 'super_admin',
  })

  // ── 4. Divisions ─────────────────────────────────────────────────────────────
  const divRows = await db.insert(divisions).values([
    { tenantId, name: 'Research & Development', slug: 'rd'       },
    { tenantId, name: 'Legal & Compliance',     slug: 'legal'    },
    { tenantId, name: 'Finance',                slug: 'finance'  },
    { tenantId, name: 'Product',                slug: 'product'  },
    { tenantId, name: 'Security',               slug: 'security' },
  ]).returning({ id: divisions.id, slug: divisions.slug })
  const div = Object.fromEntries(divRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 5 divisions')

  // ── 5. Teams ─────────────────────────────────────────────────────────────────
  const teamRows = await db.insert(teams).values([
    { tenantId, divisionId: div['rd']!,       name: 'Core Platform',       slug: 'core-platform'    },
    { tenantId, divisionId: div['rd']!,       name: 'Mobile Engineering',  slug: 'mobile'           },
    { tenantId, divisionId: div['rd']!,       name: 'Data Engineering',    slug: 'data-engineering' },
    { tenantId, divisionId: div['legal']!,    name: 'Regulatory Affairs',  slug: 'regulatory'       },
    { tenantId, divisionId: div['legal']!,    name: 'Contract Review',     slug: 'contracts'        },
    { tenantId, divisionId: div['legal']!,    name: 'Privacy & Data',      slug: 'privacy'          },
    { tenantId, divisionId: div['finance']!,  name: 'Treasury',            slug: 'treasury'         },
    { tenantId, divisionId: div['finance']!,  name: 'Financial Reporting', slug: 'reporting'        },
    { tenantId, divisionId: div['finance']!,  name: 'Risk Management',     slug: 'risk'             },
    { tenantId, divisionId: div['product']!,  name: 'Consumer Banking',    slug: 'consumer-banking' },
    { tenantId, divisionId: div['product']!,  name: 'B2B Payments',        slug: 'b2b-payments'     },
    { tenantId, divisionId: div['product']!,  name: 'Lending',             slug: 'lending'          },
    { tenantId, divisionId: div['security']!, name: 'AppSec',              slug: 'appsec'           },
    { tenantId, divisionId: div['security']!, name: 'Threat Intelligence', slug: 'threat-intel'     },
    { tenantId, divisionId: div['security']!, name: 'Compliance & Audit',  slug: 'compliance'       },
  ]).returning({ id: teams.id, slug: teams.slug })
  const team = Object.fromEntries(teamRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 15 teams')

  // ── 6. Members ───────────────────────────────────────────────────────────────
  const dummyDefs = [
    // R&D
    { email: 'alice.chen@fincorp.dev',       display: 'Alice Chen',       first: 'Alice',  last: 'Chen',    team: 'core-platform',    scans: 78, evRate: 0.12 },
    { email: 'bob.zhang@fincorp.dev',        display: 'Bob Zhang',        first: 'Bob',    last: 'Zhang',   team: 'mobile',           scans: 54, evRate: 0.09 },
    { email: 'carol.davis@fincorp.dev',      display: 'Carol Davis',      first: 'Carol',  last: 'Davis',   team: 'data-engineering', scans: 41, evRate: 0.07 },
    // Legal
    { email: 'marcus.johnson@fincorp.dev',   display: 'Marcus Johnson',   first: 'Marcus', last: 'Johnson', team: 'regulatory',       scans: 83, evRate: 0.11 },
    { email: 'diana.kim@fincorp.dev',        display: 'Diana Kim',        first: 'Diana',  last: 'Kim',     team: 'contracts',        scans: 47, evRate: 0.08 },
    { email: 'ethan.brown@fincorp.dev',      display: 'Ethan Brown',      first: 'Ethan',  last: 'Brown',   team: 'privacy',          scans: 29, evRate: 0.07 },
    // Finance
    { email: 'priya.patel@fincorp.dev',      display: 'Priya Patel',      first: 'Priya',  last: 'Patel',   team: 'treasury',         scans: 96, evRate: 0.14 },
    { email: 'frank.wilson@fincorp.dev',     display: 'Frank Wilson',     first: 'Frank',  last: 'Wilson',  team: 'reporting',        scans: 62, evRate: 0.10 },
    { email: 'grace.lee@fincorp.dev',        display: 'Grace Lee',        first: 'Grace',  last: 'Lee',     team: 'risk',             scans: 38, evRate: 0.08 },
    // Product
    { email: 'sarah.kim@fincorp.dev',        display: 'Sarah Kim',        first: 'Sarah',  last: 'Kim',     team: 'consumer-banking', scans: 71, evRate: 0.10 },
    { email: 'henry.park@fincorp.dev',       display: 'Henry Park',       first: 'Henry',  last: 'Park',    team: 'b2b-payments',     scans: 33, evRate: 0.06 },
    { email: 'iris.chen@fincorp.dev',        display: 'Iris Chen',        first: 'Iris',   last: 'Chen',    team: 'lending',          scans: 24, evRate: 0.08 },
    // Security
    { email: 'james.liu@fincorp.dev',        display: 'James Liu',        first: 'James',  last: 'Liu',     team: 'appsec',           scans: 57, evRate: 0.13 },
    { email: 'kelly.wang@fincorp.dev',       display: 'Kelly Wang',       first: 'Kelly',  last: 'Wang',    team: 'threat-intel',     scans: 44, evRate: 0.11 },
    { email: 'liam.foster@fincorp.dev',      display: 'Liam Foster',      first: 'Liam',   last: 'Foster',  team: 'compliance',       scans: 22, evRate: 0.05 },
  ]

  const memberIdMap: Record<string, { id: string; scans: number; evRate: number }> = {}

  for (const m of dummyDefs) {
    let clerkUserId: string
    const existing = await clerk.users.getUserList({ emailAddress: [m.email] })
    if (existing.data.length > 0) {
      clerkUserId = existing.data[0]!.id
      console.log(`  · ${m.email} — found`)
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [m.email], password: DUMMY_PASSWORD,
        firstName: m.first, lastName: m.last, skipPasswordChecks: true,
      })
      clerkUserId = created.id
      console.log(`  · ${m.email} — created`)
    }

    const [uRow] = await db.insert(users)
      .values({ clerkId: clerkUserId, email: m.email, firstName: m.first, lastName: m.last })
      .onConflictDoNothing().returning({ id: users.id })
    const userId = uRow?.id ?? (await db.select({ id: users.id }).from(users).where(eq(users.email, m.email)).limit(1))[0]!.id

    const [mRow] = await db.insert(members)
      .values({ tenantId, userId, email: m.email, displayName: m.display, role: 'member' })
      .returning({ id: members.id })
    memberIdMap[m.email] = { id: mRow!.id, scans: m.scans, evRate: m.evRate }
    await db.insert(memberTeams).values({ memberId: mRow!.id, teamId: team[m.team]! })
  }
  console.log(`✓ Created ${dummyDefs.length} members`)

  // ── 7. Subjects + Rules ──────────────────────────────────────────────────────
  const rulesByCategory: Record<string, string[]> = {}

  const s1 = await addSubject(tenantId,
    'API Keys & Credentials',
    'Detects secret material — cloud keys, private keys, tokens, connection strings.',
    null, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'AWS access key — never paste cloud credentials into AI tools.',
        pattern: 'AKIA[0-9A-Z]{16}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Private key block — key material must never leave secure storage.',
        pattern: '-----BEGIN\\s(?:RSA\\s|EC\\s|OPENSSH\\s)?PRIVATE KEY-----' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'JWT token — tokens grant access and must not be shared externally.',
        pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Stripe live key — provides direct payment access.',
        pattern: 'sk_live_[A-Za-z0-9]{20,}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'GitHub token — can read or write to internal repositories.',
        pattern: 'gh[pousr]_[A-Za-z0-9_]{36,255}' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Database connection string with embedded credentials detected.',
        pattern: '(?:postgres(?:ql)?|mysql|mongodb):\\/\\/[^\\s]{4,}:[^\\s@]{4,}@' },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Possible .env file content pasted — check for secrets before sending.',
        pattern: '(?:^|\\n)[A-Z][A-Z0-9_]{3,}=["\']?[^\\s"\']{12,}["\']?' },
    ]
  )
  rulesByCategory['api_keys'] = s1.ruleIds

  const s2 = await addSubject(tenantId,
    'Employee & Customer PII',
    'Stops SSNs, card numbers, health records and other personal identifiers.',
    null, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'US Social Security Number — PII is prohibited in AI prompts.',
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Visa card number — PCI-DSS prohibits sharing card data.',
        pattern: '\\b4[0-9]{12}(?:[0-9]{3})?\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Mastercard number — do not share payment card data.',
        pattern: '\\b5[1-5][0-9]{14}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Amex card number — do not share payment card data.',
        pattern: '\\b3[47][0-9]{13}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'medium',
        message: 'Passport number pattern — do not include travel documents in AI prompts.',
        pattern: '\\b[A-Z]{1,2}[0-9]{6,9}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Personal identifiers referenced — confirm no real data is included.',
        keywords: ['date of birth', 'home address', 'health record', 'national insurance', 'tax id', 'driver license'] },
    ]
  )
  rulesByCategory['pii'] = s2.ruleIds

  const s3 = await addSubject(tenantId,
    'Internal & Confidential Communications',
    'Catches confidential memos, embargoed announcements, and board materials.',
    null, null, [
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Confidentiality marker detected — verify this content is safe to share.',
        keywords: ['confidential', 'internal only', 'do not distribute', 'embargoed', 'draft — not for release'] },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Restricted content — this document must not leave internal systems.',
        keywords: ['board confidential', 'M&A confidential', 'restricted — eyes only', 'privileged draft'] },
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'Internal document reference number detected.',
        pattern: 'FINCORP-[A-Z]+-\\d{4,}' },
    ]
  )
  rulesByCategory['internal'] = s3.ruleIds

  const s4 = await addSubject(tenantId,
    'Financial Account Data',
    'IBAN numbers, SWIFT codes, account references — must not enter AI chat.',
    div['finance']!, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'IBAN detected — bank account numbers must not be shared with AI tools.',
        pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{4}\\d{7,}\\b' },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Wire transfer reference — verify this is not a live transaction.',
        pattern: '\\bTX-\\d{8,}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Sensitive financial terminology — review prompt before sending.',
        keywords: ['wire transfer', 'account number', 'routing number', 'settlement amount', 'nostro account', 'correspondent bank'] },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Treasury system credentials or account data detected.',
        keywords: ['SWIFT credentials', 'treasury login', 'payment gateway key', 'FX settlement code'] },
    ]
  )
  rulesByCategory['financial'] = s4.ruleIds

  const s5 = await addSubject(tenantId,
    'Trading & Investment Intelligence',
    'Trading positions, strategies, and material non-public information (MNPI).',
    div['finance']!, null, [
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Potential MNPI — material non-public information cannot be shared with AI.',
        keywords: ['material non-public', 'MNPI', 'insider information', 'not yet announced', 'pre-announcement'] },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Trading order syntax detected — position details are confidential.',
        pattern: '(?:buy|sell)\\s+\\d+\\s+[A-Z]{1,5}\\s+(?:@|at)\\s+(?:market|\\d+(?:\\.\\d+)?)' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Proprietary investment strategy terms — confirm no model details are included.',
        keywords: ['alpha strategy', 'risk-weighted position', 'portfolio rebalance', 'exposure limit', 'stress scenario'] },
    ]
  )
  rulesByCategory['trading'] = s5.ruleIds

  const s6 = await addSubject(tenantId,
    'Legal Privilege & Case Information',
    'Privileged legal communications and active case references.',
    div['legal']!, null, [
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Attorney-client privileged content — must not be shared with external AI services.',
        keywords: ['attorney-client privilege', 'privileged and confidential', 'work product doctrine', 'legal hold'] },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Case file reference — active litigation details are confidential.',
        pattern: 'FC-\\d{4}-[A-Z]{2,4}-\\d{3,}' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Regulatory investigation reference — confirm this is appropriate to share.',
        keywords: ['SEC inquiry', 'DOJ investigation', 'FCA review', 'regulatory subpoena', 'consent order'] },
    ]
  )
  rulesByCategory['legal'] = s6.ruleIds

  const s7 = await addSubject(tenantId,
    'Regulatory Filings & Compliance Data',
    'Draft regulatory submissions and SAR/CTR reports before filing.',
    div['legal']!, null, [
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Pre-filing regulatory document — confirm this draft is appropriate for AI use.',
        keywords: ['Form 10-K draft', 'Form 10-Q', 'annual report draft', 'Basel III disclosure', 'Pillar 3 report'] },
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'Regulatory filing reference number detected.',
        pattern: '\\b(?:SEC|FINRA|FCA)-[0-9]{6,}\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Suspicious activity report content — SAR information is highly sensitive.',
        keywords: ['suspicious activity report', 'SAR narrative', 'AML alert', 'money laundering indicator', 'CTR filing'] },
    ]
  )
  rulesByCategory['compliance'] = s7.ruleIds

  const s8 = await addSubject(tenantId,
    'Source Code & Technical Secrets',
    'Proprietary algorithms, internal endpoints, and hardcoded credentials.',
    div['rd']!, null, [
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Hardcoded credential in code snippet — remove secrets before sharing.',
        pattern: '(?:password|secret|token|api_key)\\s*[=:]\\s*["\'][^"\']{8,}["\']' },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Internal API endpoint — do not expose internal service URLs.',
        pattern: 'https?:\\/\\/(?:api-internal|internal|corp)\\.fincorp\\.(?:com|dev|internal)' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Proprietary algorithm reference — confirm no IP is being shared.',
        keywords: ['proprietary algorithm', 'trade secret', 'patent pending', 'our scoring model', 'internal ML model'] },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Production environment variable block detected.',
        pattern: '(?:DATABASE_URL|REDIS_URL|SECRET_KEY)\\s*=\\s*["\']?[^\\s"\']{15,}' },
    ]
  )
  rulesByCategory['source_code'] = s8.ruleIds

  const s9 = await addSubject(tenantId,
    'Unreleased Product & Roadmap',
    'Unannounced features, codenames, and roadmap items before public disclosure.',
    div['product']!, null, [
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Product codename detected — unreleased product details are embargoed.',
        keywords: ['Project Marble', 'Project Kraken', 'Project Atlas', 'Project Nexus', 'Project Vega'] },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Roadmap terminology — confirm no unannounced features are described.',
        keywords: ['unannounced feature', 'Q4 launch', 'private preview', 'soft launch plan', 'embargo date'] },
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Internal project ticket reference detected.',
        pattern: '\\b(?:PROD|PLAT|ENG|SEC)-\\d{3,}\\b' },
    ]
  )
  rulesByCategory['product'] = s9.ruleIds

  const s10 = await addSubject(tenantId,
    'Vulnerability & Exploit Intelligence',
    'Internal vulnerability reports and active exploit research.',
    div['security']!, null, [
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'CVE reference detected — confirm this is not an unreleased vulnerability.',
        pattern: 'CVE-\\d{4}-\\d{4,}' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Zero-day details — unreleased exploit must not leave internal systems.',
        keywords: ['zero-day', '0-day', 'unreleased exploit', 'pre-patch disclosure', 'responsible disclosure pending'] },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Penetration test findings — confirm this is not from an active engagement.',
        keywords: ['pentest report', 'red team finding', 'exploitation path', 'proof of concept', 'attack chain'] },
    ]
  )
  rulesByCategory['vulns'] = s10.ruleIds

  const s11 = await addSubject(tenantId,
    'Internal Infrastructure & Network Data',
    'Internal IPs, hostnames, and network topology must stay internal.',
    div['security']!, null, [
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Private IP address detected — internal network addresses must not be shared.',
        pattern: '\\b(?:10\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168)\\.\\d{1,3}\\.\\d{1,3}\\b' },
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Production hostname detected — system names reveal infrastructure topology.',
        pattern: '\\b[a-z]+-(?:prod|stg|internal)-[a-z0-9-]+\\.fincorp\\.internal\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'minimal',
        message: 'Network topology reference — confirm no sensitive infrastructure details included.',
        keywords: ['VPN subnet', 'firewall rule', 'NAT gateway', 'internal load balancer', 'network segment', 'VLAN config'] },
    ]
  )
  rulesByCategory['infra'] = s11.ruleIds

  const totalRules = Object.values(rulesByCategory).reduce((sum, ids) => sum + ids.length, 0)
  console.log(`✓ Created 11 subjects with ${totalRules} rules`)

  // ── 8. Site configs ──────────────────────────────────────────────────────────
  await db.insert(siteConfigs).values([
    { tenantId, domain: 'chatgpt.com',           inputSelector: '#prompt-textarea',            sendButtonSelector: 'button[data-testid="send-button"]'  },
    { tenantId, domain: 'claude.ai',             inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send Message"]'  },
    { tenantId, domain: 'gemini.google.com',     inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send message"]'  },
    { tenantId, domain: 'copilot.microsoft.com', inputSelector: 'textarea#userInput',           sendButtonSelector: 'button[aria-label="Submit message"]' },
  ])

  // ── 9. Historical scans (~780 total) ─────────────────────────────────────────
  const scanBatch: { tenantId: string; memberId: string; occurredAt: Date }[] = []
  for (const [, m] of Object.entries(memberIdMap)) {
    for (let i = 0; i < m.scans; i++) {
      scanBatch.push({ tenantId, memberId: m.id, occurredAt: pastDate(30) })
    }
  }
  for (let i = 0; i < scanBatch.length; i += 100)
    await db.insert(scans).values(scanBatch.slice(i, i + 100))
  console.log(`✓ Inserted ${scanBatch.length} historical scans`)

  // ── 10. Historical events (~80 total) ────────────────────────────────────────
  // Weighted site distribution: ChatGPT most popular
  const sitePool = [
    'https://chatgpt.com', 'https://chatgpt.com', 'https://chatgpt.com', 'https://chatgpt.com',
    'https://chatgpt.com',
    'https://claude.ai', 'https://claude.ai', 'https://claude.ai',
    'https://gemini.google.com', 'https://gemini.google.com',
    'https://copilot.microsoft.com',
  ]

  // (category, matchedTerm, action) — realistic threat catalogue
  const threatTemplates: Array<{ cat: string; term: string; action: 'warn' | 'block' }> = [
    // API keys
    { cat: 'api_keys', term: 'AKIAIOSFODNN7EXAMPLE',                                         action: 'block' },
    { cat: 'api_keys', term: '-----BEGIN RSA PRIVATE KEY-----',                                action: 'block' },
    { cat: 'api_keys', term: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEyM30.signature',      action: 'block' },
    { cat: 'api_keys', term: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc',                             action: 'block' },
    { cat: 'api_keys', term: 'postgres://admin:p@ssw0rd@prod-db.fincorp.internal:5432/main',  action: 'block' },
    { cat: 'api_keys', term: 'DATABASE_URL=postgresql://app:s3cr3t@prod.rds.amazonaws.com',   action: 'warn'  },
    { cat: 'api_keys', term: 'SECRET_KEY=q7x!mNp2Rv9kLs3WtYuZ',                              action: 'warn'  },
    // PII
    { cat: 'pii',      term: '4242 4242 4242 4242',                                           action: 'block' },
    { cat: 'pii',      term: '345-12-6789',                                                   action: 'block' },
    { cat: 'pii',      term: '5105 1051 0510 5100',                                           action: 'block' },
    { cat: 'pii',      term: 'date of birth',                                                 action: 'warn'  },
    { cat: 'pii',      term: 'home address',                                                  action: 'warn'  },
    { cat: 'pii',      term: 'health record',                                                 action: 'warn'  },
    // Internal
    { cat: 'internal', term: 'confidential',                                                  action: 'warn'  },
    { cat: 'internal', term: 'internal only',                                                 action: 'warn'  },
    { cat: 'internal', term: 'board confidential',                                            action: 'block' },
    { cat: 'internal', term: 'FINCORP-Q4-2024-STRATEGY',                                     action: 'warn'  },
    // Financial
    { cat: 'financial', term: 'GB29NWBK60161331926819',                                      action: 'block' },
    { cat: 'financial', term: 'wire transfer',                                                action: 'warn'  },
    { cat: 'financial', term: 'TX-20240315-009281',                                           action: 'warn'  },
    { cat: 'financial', term: 'SWIFT credentials',                                            action: 'block' },
    // Trading
    { cat: 'trading',  term: 'MNPI',                                                          action: 'block' },
    { cat: 'trading',  term: 'sell 500 AAPL at market',                                      action: 'warn'  },
    { cat: 'trading',  term: 'alpha strategy',                                                action: 'warn'  },
    { cat: 'trading',  term: 'material non-public',                                           action: 'block' },
    // Legal
    { cat: 'legal',    term: 'attorney-client privilege',                                     action: 'block' },
    { cat: 'legal',    term: 'FC-2024-SEC-0421',                                              action: 'block' },
    { cat: 'legal',    term: 'SEC inquiry',                                                   action: 'warn'  },
    { cat: 'legal',    term: 'legal hold',                                                    action: 'block' },
    // Compliance
    { cat: 'compliance', term: 'SAR narrative',                                               action: 'block' },
    { cat: 'compliance', term: 'Form 10-K draft',                                             action: 'warn'  },
    { cat: 'compliance', term: 'FINRA-2024-089123',                                           action: 'warn'  },
    // Source code
    { cat: 'source_code', term: 'password = "Sup3rS3cr3t!"',                                 action: 'block' },
    { cat: 'source_code', term: 'DATABASE_URL = postgres://prod-user:xyz@db.internal',        action: 'block' },
    { cat: 'source_code', term: 'proprietary algorithm',                                      action: 'warn'  },
    { cat: 'source_code', term: 'api-internal.fincorp.internal/v2/risk-score',                action: 'warn'  },
    { cat: 'source_code', term: 'SECRET_KEY=q7Nk#P2mX9vLt4',                                 action: 'block' },
    // Vulns
    { cat: 'vulns',    term: 'CVE-2024-1337',                                                 action: 'warn'  },
    { cat: 'vulns',    term: 'zero-day',                                                      action: 'block' },
    { cat: 'vulns',    term: 'pentest report',                                                action: 'warn'  },
    { cat: 'vulns',    term: 'proof of concept',                                              action: 'warn'  },
    // Infra
    { cat: 'infra',    term: '10.0.42.100',                                                   action: 'warn'  },
    { cat: 'infra',    term: 'payments-prod-api-01.fincorp.internal',                         action: 'block' },
    { cat: 'infra',    term: 'VPN subnet',                                                    action: 'warn'  },
    { cat: 'infra',    term: '192.168.10.55',                                                 action: 'warn'  },
    // Product
    { cat: 'product',  term: 'Project Marble',                                                action: 'block' },
    { cat: 'product',  term: 'Q4 launch',                                                     action: 'warn'  },
    { cat: 'product',  term: 'PROD-1847',                                                     action: 'warn'  },
    { cat: 'product',  term: 'Project Kraken',                                                action: 'block' },
  ]

  let totalEvents = 0
  const eventBatch: Array<{
    tenantId: string; ruleId: string; memberId: string
    action: 'warn' | 'block'; siteUrl: string
    matchedTerm: string; occurredAt: Date
  }> = []

  for (const [, m] of Object.entries(memberIdMap)) {
    const count = Math.max(1, Math.round(m.scans * m.evRate))
    for (let i = 0; i < count; i++) {
      const tmpl = pick(threatTemplates)
      const rulePool = rulesByCategory[tmpl.cat]!
      eventBatch.push({
        tenantId,
        ruleId:      rulePool[Math.floor(rng() * rulePool.length)]!,
        memberId:    m.id,
        action:      tmpl.action,
        siteUrl:     pick(sitePool),
        matchedTerm: tmpl.term,
        occurredAt:  pastDate(30),
      })
      totalEvents++
    }
  }

  // Sort oldest-first for natural ordering
  eventBatch.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
  for (const e of eventBatch) await db.insert(events).values(e)
  console.log(`✓ Inserted ${totalEvents} historical threat events`)

  // ── 11. Compile & publish policy ────────────────────────────────────────────
  const policyDoc = await compilePolicy(tenantId)
  const version   = await publishPolicy(tenantId, policyDoc)
  console.log(`✓ Published policy v${version}`)

  // ── Summary ──────────────────────────────────────────────────────────────────
  const blocked = eventBatch.filter(e => e.action === 'block').length
  const warned  = eventBatch.filter(e => e.action === 'warn').length

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║  FinCorp seed complete!                                          ║
╠══════════════════════════════════════════════════════════════════╣
║  15 members · 5 divisions · 15 teams                             ║
║  11 subjects · ${totalRules} rules                                        ║
║  ${scanBatch.length} scans · ${blocked} blocked · ${warned} warned (last 30 days)          ║
╠══════════════════════════════════════════════════════════════════╣
║  Sign in as any member — password: Fincorp2026!                  ║
╠══════════════════════════════════════════════════════════════════╣`)
  for (const m of dummyDefs)
    console.log(`║  ${m.email.padEnd(38)}  [${m.team.padEnd(16)}]  ║`)
  console.log(`╚══════════════════════════════════════════════════════════════════╝`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
