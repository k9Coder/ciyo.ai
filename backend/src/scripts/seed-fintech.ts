/**
 * Fintech demo seed for "Yarin's Organization" (FinCorp).
 * Run: npm run seed:fintech
 *
 * Safe to re-run — clears existing divisions/teams/members/subjects/rules
 * for the tenant and rebuilds from scratch, preserving your admin clerkId
 * so Clerk auth keeps working after seeding.
 *
 * Uses the Clerk Backend API to create real user accounts for each dummy
 * member and add them to your Clerk org — no invite email needed.
 * They can sign in via the extension immediately using email + password:
 *   email:    alice.chen@fincorp.dev  (or whatever dummyDefs says)
 *   password: Fincorp2026!
 */

import { createClerkClient } from '@clerk/backend'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, members, memberTeams,
  subjects, rules, siteConfigs, events, scans,
} from '../db/schema.js'
import { compilePolicy } from '../policy/compiler.js'
import { publishPolicy } from '../policy/service.js'

const ADMIN_EMAIL  = 'yarin0600@gmail.com'
const DUMMY_PASSWORD = 'Fincorp2026!'

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Initialise Clerk client
  const clerkSecretKey = process.env['CLERK_SECRET_KEY']
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set in .env')
  const clerk = createClerkClient({ secretKey: clerkSecretKey })

  // 2. Find tenant (by admin email, then fallback to first tenant)
  const [adminRow] = await db
    .select({ tenantId: members.tenantId, clerkId: members.clerkId })
    .from(members)
    .where(eq(members.email, ADMIN_EMAIL))
    .limit(1)

  let tenantId: string
  let savedClerkId: string | null = null

  if (adminRow) {
    tenantId     = adminRow.tenantId
    savedClerkId = adminRow.clerkId ?? null
  } else {
    const [t] = await db.select({ id: tenants.id }).from(tenants).limit(1)
    if (!t) throw new Error('No tenant found. Start the app and sign in through Clerk first.')
    tenantId = t.id
  }

  // Resolve the Clerk org ID for this tenant
  const [tenantRow] = await db
    .select({ clerkOrgId: tenants.clerkOrgId })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1)
  const clerkOrgId = tenantRow?.clerkOrgId
  if (!clerkOrgId) throw new Error('Tenant has no clerkOrgId — sign in through the admin once to link it.')

  console.log(`✓ Tenant ${tenantId} · Clerk org ${clerkOrgId} (admin clerkId preserved: ${savedClerkId ?? 'none'})`)

  // 2. Clear existing seed data for this tenant (preserve tenant row + policies)
  await db.delete(events).where(eq(events.tenantId, tenantId))
  await db.delete(scans).where(eq(scans.tenantId, tenantId))

  const existingMembers = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.tenantId, tenantId))
  if (existingMembers.length > 0) {
    await db.delete(memberTeams).where(
      inArray(memberTeams.memberId, existingMembers.map(m => m.id)),
    )
  }
  await db.delete(rules).where(eq(rules.tenantId, tenantId))
  await db.delete(subjects).where(eq(subjects.tenantId, tenantId))
  await db.delete(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
  await db.delete(members).where(eq(members.tenantId, tenantId))
  await db.delete(teams).where(eq(teams.tenantId, tenantId))
  await db.delete(divisions).where(eq(divisions.tenantId, tenantId))
  console.log('✓ Cleared existing seed data')

  // 3. Re-create the admin member (preserve clerkId so Clerk auth still works)
  const [adminMember] = await db
    .insert(members)
    .values({ tenantId, email: ADMIN_EMAIL, displayName: 'Yarin', role: 'super_admin', clerkId: savedClerkId })
    .returning({ id: members.id })
  const adminMemberId = adminMember!.id

  // 4. Divisions
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

  // 5. Teams
  const teamDefs = [
    // R&D
    { divisionId: div['rd']!,       name: 'Core Platform',      slug: 'core-platform'    },
    { divisionId: div['rd']!,       name: 'Mobile',             slug: 'mobile'           },
    { divisionId: div['rd']!,       name: 'Data Engineering',   slug: 'data-engineering' },
    // Legal
    { divisionId: div['legal']!,    name: 'Regulatory Affairs', slug: 'regulatory'       },
    { divisionId: div['legal']!,    name: 'Contract Review',    slug: 'contracts'        },
    { divisionId: div['legal']!,    name: 'Privacy & Data',     slug: 'privacy'          },
    // Finance
    { divisionId: div['finance']!,  name: 'Treasury',           slug: 'treasury'         },
    { divisionId: div['finance']!,  name: 'Financial Reporting',slug: 'reporting'        },
    { divisionId: div['finance']!,  name: 'Risk Management',    slug: 'risk'             },
    // Product
    { divisionId: div['product']!,  name: 'Consumer Banking',   slug: 'consumer-banking' },
    { divisionId: div['product']!,  name: 'B2B Payments',       slug: 'b2b-payments'     },
    { divisionId: div['product']!,  name: 'Lending',            slug: 'lending'          },
    // Security
    { divisionId: div['security']!, name: 'AppSec',             slug: 'appsec'           },
    { divisionId: div['security']!, name: 'Threat Intelligence',slug: 'threat-intel'     },
    { divisionId: div['security']!, name: 'Compliance & Audit', slug: 'compliance'       },
  ]

  const teamRows = await db
    .insert(teams)
    .values(teamDefs.map(t => ({ tenantId, ...t })))
    .returning({ id: teams.id, slug: teams.slug })

  const team = Object.fromEntries(teamRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 15 teams')

  // 6. Dummy members — created in Clerk + added to the org + linked in DB
  //    Sign in via the extension with: email below · password: Fincorp2026!
  const dummyDefs = [
    { email: 'alice.chen@fincorp.dev',     displayName: 'Alice Chen',     firstName: 'Alice',   lastName: 'Chen',     teamSlug: 'core-platform'    },
    { email: 'david.ross@fincorp.dev',     displayName: 'David Ross',     firstName: 'David',   lastName: 'Ross',     teamSlug: 'mobile'           },
    { email: 'nina.park@fincorp.dev',      displayName: 'Nina Park',      firstName: 'Nina',    lastName: 'Park',     teamSlug: 'data-engineering' },
    { email: 'marcus.johnson@fincorp.dev', displayName: 'Marcus Johnson', firstName: 'Marcus',  lastName: 'Johnson',  teamSlug: 'regulatory'       },
    { email: 'emily.watson@fincorp.dev',   displayName: 'Emily Watson',   firstName: 'Emily',   lastName: 'Watson',   teamSlug: 'contracts'        },
    { email: 'priya.patel@fincorp.dev',    displayName: 'Priya Patel',    firstName: 'Priya',   lastName: 'Patel',    teamSlug: 'treasury'         },
    { email: 'james.ford@fincorp.dev',     displayName: 'James Ford',     firstName: 'James',   lastName: 'Ford',     teamSlug: 'risk'             },
    { email: 'tom.bradley@fincorp.dev',    displayName: 'Tom Bradley',    firstName: 'Tom',     lastName: 'Bradley',  teamSlug: 'consumer-banking' },
    { email: 'sarah.kim@fincorp.dev',      displayName: 'Sarah Kim',      firstName: 'Sarah',   lastName: 'Kim',      teamSlug: 'appsec'           },
    { email: 'raj.mehta@fincorp.dev',      displayName: 'Raj Mehta',      firstName: 'Raj',     lastName: 'Mehta',    teamSlug: 'threat-intel'     },
  ]

  for (const m of dummyDefs) {
    // Find or create the Clerk user
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

    // Add to the Clerk org (ignore if already a member)
    const memberships = await clerk.organizations.getOrganizationMembershipList({ organizationId: clerkOrgId })
    const alreadyMember = memberships.data.some(ms => ms.publicUserData?.userId === clerkUserId)
    if (!alreadyMember) {
      await clerk.organizations.createOrganizationMembership({
        organizationId: clerkOrgId,
        userId: clerkUserId,
        role: 'org:member',
      })
    }

    // Insert into DB with clerkId set
    const [row] = await db
      .insert(members)
      .values({ tenantId, email: m.email, displayName: m.displayName, role: 'member', clerkId: clerkUserId })
      .returning({ id: members.id })
    await db.insert(memberTeams).values({ memberId: row!.id, teamId: team[m.teamSlug]! })
  }
  console.log('✓ Created 10 dummy members in Clerk + DB')

  // 7. Subjects + Rules ────────────────────────────────────────────────────────

  // ── Global (every employee) ─────────────────────────────────────────────────

  await addSubject(tenantId,
    'API Keys & Secrets',
    'Detects real credential formats — AWS keys, private key blocks, JWTs, Stripe keys, GitHub tokens.',
    null, null, [
      // AWS access key IDs: AKIA + 16 uppercase alphanumerics
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'AWS access key detected — never paste cloud credentials into AI assistants.',
        pattern: 'AKIA[0-9A-Z]{16}' },
      // PEM-style private key headers
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Private key material detected — this must never leave secure storage.',
        pattern: '-----BEGIN\\s(?:RSA\\s|EC\\s|OPENSSH\\s)?PRIVATE KEY-----' },
      // JWT tokens (two base64url segments separated by dots)
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'JWT token detected — tokens grant access and should not be shared.',
        pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}' },
      // Stripe live secret keys
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Stripe API key detected — live keys provide direct payment access.',
        pattern: 'sk_live_[A-Za-z0-9]{20,}' },
      // GitHub fine-grained and classic personal access tokens
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'GitHub token detected — this can read or write to our repositories.',
        pattern: 'gh[pousr]_[A-Za-z0-9_]{36,255}' },
      // .env-style lines: FOO_BAR=some_long_value (catches copy-pasted env files)
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Possible .env file content pasted — check for secrets before sending.',
        pattern: '(?:^|\\n)[A-Z][A-Z0-9_]{3,}=["\']?[^\\s"\']{12,}["\']?' },
    ]
  )

  await addSubject(tenantId,
    'Employee & Customer PII',
    'Stops SSNs, credit card numbers, and passport-style identifiers from reaching AI tools.',
    null, null, [
      // US Social Security Numbers: 000-00-0000
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'US Social Security Number detected — PII is prohibited in AI prompts.',
        pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' },
      // Visa card numbers (13 or 16 digits starting with 4)
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — PCI-DSS prohibits sharing card data.',
        pattern: '\\b4[0-9]{12}(?:[0-9]{3})?\\b' },
      // Mastercard (51-55 + 14 digits)
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — do not share payment card data.',
        pattern: '\\b5[1-5][0-9]{14}\\b' },
      // Amex (34 or 37 + 13 digits)
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit card number detected — do not share payment card data.',
        pattern: '\\b3[47][0-9]{13}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Prompt references personal identifiers — confirm no real data is included.',
        keywords: ['date of birth', 'home address', 'health record', 'medical history',
                   'national insurance number', 'tax identification number', 'biometric data'] },
    ]
  )

  await addSubject(tenantId,
    'Internal Financial Figures',
    'Warns when non-public financial metrics appear — burn rate, cap table, valuation details.',
    null, null, [
      // Dollar/euro amounts in the millions+ range — likely meaningful financials
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Large monetary figure detected — confirm this isn\'t non-public financial data.',
        pattern: '\\$[\\d,]{4,}(?:\\.\\d{2})?\\s*(?:million|billion|[MB])\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'minimal',
        message: 'Internal financial data should not leave the organisation.',
        keywords: ['burn rate', 'runway', 'cap table', 'pre-money valuation',
                   'post-money valuation', 'investor deck', 'term sheet', 'down round',
                   'SAFE note', 'convertible note'] },
    ]
  )

  // ── R&D Division ─────────────────────────────────────────────────────────────

  await addSubject(tenantId,
    'Embedded Secrets in Code',
    'Catches hardcoded credentials and internal package imports inside pasted code snippets.',
    div['rd']!, null, [
      // Hardcoded strings that look like secrets inside code: x = "aBcD1234..."
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Hardcoded secret in code detected — use environment variables, not literals.',
        pattern: '(?:password|secret|token|api_?key)\\s*[=:]\\s*["\'][^"\']{8,}["\']' },
      // Internal @fincorp/ npm package imports — reveals private package names
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'Internal package reference detected — our private packages are not public.',
        pattern: 'from\\s+["\']@fincorp\\/[a-z][a-z0-9-]*["\']' },
      // Very large fenced code blocks (likely pasting entire files)
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'Large code block pasted — verify it contains no secrets or proprietary logic.',
        pattern: '```[\\s\\S]{500,}```' },
    ]
  )

  await addSubject(tenantId,
    'Infrastructure & Architecture',
    'Warns on private IP ranges, internal hostnames, and cluster configuration details.',
    div['rd']!, null, [
      // RFC-1918 private IPs — internal network topology
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Private IP address detected — internal network details are confidential.',
        pattern: '\\b(?:10\\.\\d{1,3}|172\\.(?:1[6-9]|2\\d|3[01])|192\\.168)\\.\\d{1,3}\\.\\d{1,3}\\b' },
      // Internal *.fincorp.internal or *.fincorp.local hostnames
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Internal hostname detected — do not share infrastructure topology.',
        pattern: '[a-z0-9-]+\\.fincorp\\.(?:internal|local)' },
      { kind: 'keyword', action: 'warn', reportLevel: 'minimal',
        message: 'System architecture details are confidential.',
        keywords: ['prod database host', 'Kafka cluster config', 'private subnet CIDR',
                   'VPC peering', 'bastion host', 'service mesh config', 'mTLS certificate'] },
    ]
  )

  await addSubject(tenantId,
    'ML Training Data & Benchmarks',
    'Prevents internal model evaluation scores, training sets, and proprietary embeddings from leaking.',
    div['rd']!, team['data-engineering']!, [
      // File paths to common ML dataset formats
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'ML dataset file path detected — training data is proprietary.',
        pattern: '\\.(?:parquet|tfrecord|jsonl|feather|hdf5)\\b' },
      // Eval results that look like "accuracy: 0.9234" or "F1: 0.87"
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Benchmark metric detected — internal model scores are confidential.',
        pattern: '\\b(?:accuracy|f1|auc|bleu|rouge)\\s*:\\s*0\\.\\d{2,4}\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Internal ML data references must not leave the organisation.',
        keywords: ['fine-tuning dataset', 'proprietary embedding', 'internal eval score',
                   'human feedback labels', 'RLHF reward model', 'shadow model', 'canary model'] },
    ]
  )

  // ── Legal & Compliance Division ───────────────────────────────────────────────

  await addSubject(tenantId,
    'Attorney-Client Privilege',
    'Detects privilege markers and legal opinion headers in pasted documents.',
    div['legal']!, null, [
      // Privilege stamps that appear at the top of legal documents
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Attorney-client privilege marker detected — privileged communications must stay offline.',
        pattern: '(?i)(?:attorney.client\\s+privilege|privileged\\s+(?:and|&)\\s+confidential|work\\s+product\\s+doctrine)' },
      // US federal case numbers: 23-cv-04521
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Court case number detected — confirm this is not from an active matter.',
        pattern: '\\b\\d{2}-(?:cv|cr|mc|ap)-\\d{4,6}\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Legal opinion or litigation material — do not share with AI tools.',
        keywords: ['litigation strategy', 'counsel memo', 'legal hold notice',
                   'deposition outline', 'settlement conference', 'demand letter draft'] },
    ]
  )

  await addSubject(tenantId,
    'Regulatory Filings',
    'Blocks draft submissions to SEC, FINRA, OCC, GDPR authorities, and other regulators.',
    div['legal']!, team['regulatory']!, [
      // SEC filing references — "10-K", "8-K", "Form S-1"
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'SEC filing reference detected — draft regulatory documents are confidential.',
        pattern: '\\b(?:Form\\s)?(?:10-[KQ]|8-K|S-1|14A|DEF\\s14A|13[FGD])\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Regulatory submission materials must not be shared externally.',
        keywords: ['consent order', 'FINRA report', 'OCC examination response',
                   'MAS submission', 'PRA supervisory notice', 'enforcement action response',
                   'GDPR DPA filing', 'SAR filing', 'BSA examination'] },
    ]
  )

  await addSubject(tenantId,
    'Contract Redlines & Terms',
    'Warns on negotiated contract clauses and spotted redline/track-changes formatting.',
    div['legal']!, team['contracts']!, [
      // Word-style tracked changes notation: [[Added: ...]] or strikethrough markers
      { kind: 'pattern', action: 'warn', reportLevel: 'medium',
        message: 'Track-changes formatting detected — confirm this draft isn\'t a live negotiation.',
        pattern: '\\[\\[\\s*(?:added|deleted|changed|inserted)\\s*:' },
      // Common clause names that only appear in live contract negotiations
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Negotiated contract term detected — review before sharing with AI.',
        keywords: ['indemnification cap', 'limitation of liability', 'most-favoured-nation',
                   'anti-assignment clause', 'liquidated damages', 'ratchet clause',
                   'material adverse change', 'drag-along rights', 'tag-along rights'] },
    ]
  )

  // ── Finance Division ───────────────────────────────────────────────────────────

  await addSubject(tenantId,
    'Material Non-Public Information',
    'Blocks pre-earnings data, forward guidance, and analyst-call scripts (MNPI under securities law).',
    div['finance']!, null, [
      // Quarterly EPS strings: "Q3 EPS: $1.24" or "Q4 guidance of $2.1B"
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Earnings figure detected — pre-release financials constitute MNPI.',
        pattern: '\\bQ[1-4]\\s+(?:EPS|revenue|guidance|earnings)\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Material non-public information must not be submitted to external AI.',
        keywords: ['analyst call script', 'pre-earnings disclosure', 'beat by',
                   'miss on revenue', 'guidance cut', 'surprise upside', 'whisper number',
                   'blackout period breach'] },
    ]
  )

  await addSubject(tenantId,
    'Customer Account Data',
    'Detects IBANs, SWIFT/BIC codes, and bare long numeric strings that look like account numbers.',
    div['finance']!, null, [
      // IBAN: 2 letters + 2 digits + up to 30 alphanumerics (GB29NWBK60161331926819)
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'IBAN detected — customer account identifiers must not leave secure systems.',
        pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{4,30}\\b' },
      // SWIFT/BIC codes: 8 or 11 char uppercase alphanumeric
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'SWIFT/BIC code detected — do not share transaction routing data.',
        pattern: '\\b[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Customer financial data is protected — do not paste into AI tools.',
        keywords: ['wire transfer confirmation', 'customer ledger', 'payment record',
                   'chargeback dispute', 'NSF return', 'ACH trace number'] },
    ]
  )

  await addSubject(tenantId,
    'Pricing & Treasury Strategy',
    'Warns on FX hedging models, internal spreads, and transfer-pricing policy details.',
    div['finance']!, team['treasury']!, [
      // FX rates written as "EUR/USD: 1.0823" or "GBP/USD 1.27"
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'FX rate pair detected — confirm this isn\'t from our internal rate sheet.',
        pattern: '\\b(?:EUR|GBP|JPY|CHF|AUD|CAD)\\/(?:USD|EUR|GBP)\\s*[:\\s]\\s*\\d\\.\\d{2,5}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'medium',
        message: 'Internal treasury strategy is commercially sensitive.',
        keywords: ['FX markup', 'bid-ask spread model', 'cost of funds', 'transfer pricing policy',
                   'hedging strategy', 'yield curve assumption', 'duration mismatch',
                   'notional swap', 'collateral haircut'] },
    ]
  )

  // ── Product Division ────────────────────────────────────────────────────────

  await addSubject(tenantId,
    'Unreleased Product Roadmap',
    'Warns on launch dates, feature codenames, and go-to-market strategy.',
    div['product']!, null, [
      // Internal codenames often look like "Project Falcon" or "Operation Mercury"
      { kind: 'pattern', action: 'warn', reportLevel: 'minimal',
        message: 'Internal project codename detected — codenames reveal roadmap intent.',
        pattern: '(?i)\\bProject\\s+[A-Z][a-z]{3,}\\b' },
      { kind: 'keyword', action: 'warn', reportLevel: 'minimal',
        message: 'Unreleased product details must stay inside the organisation.',
        keywords: ['launch date', 'feature spec', 'go-to-market plan',
                   'competitive positioning', 'pivot plan', 'acquisition target',
                   'dark launch', 'soft launch window', 'beta embargo'] },
    ]
  )

  await addSubject(tenantId,
    'User Research Data',
    'Blocks session recordings, verbatim interview transcripts, and identifiable cohort data.',
    div['product']!, null, [
      // Amplitude/Mixpanel user IDs: usually UUIDs or long hex strings used as user-ID mappings
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'User identifier detected — do not paste user tracking data into AI tools.',
        pattern: '"(?:userId|user_id|distinct_id)"\\s*:\\s*"[^"]{8,}"' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'User research data may contain PII — prohibited in external AI systems.',
        keywords: ['user interview transcript', 'focus group recording', 'session replay export',
                   'NPS verbatim', 'retention cohort export', 'A/B test segment',
                   'heatmap recording', 'rage click session'] },
    ]
  )

  await addSubject(tenantId,
    'Credit & Underwriting Models',
    'Blocks applicant scoring data and proprietary model thresholds.',
    div['product']!, team['lending']!, [
      // Underwriting output lines like "credit score: 712" or "FICO: 680"
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Credit score value detected — underwriting data must not be shared externally.',
        pattern: '\\b(?:FICO|credit\\s+score|VantageScore)\\s*[:\\s]\\s*[3-8]\\d{2}\\b' },
      // DTI ratios: "DTI: 43%" or "debt-to-income of 38.5%"
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Applicant DTI ratio detected — loan application data is regulated PII.',
        pattern: '\\b(?:DTI|debt.to.income)\\s*(?:ratio\\s*)?[:\\s]\\s*\\d{1,2}(?:\\.\\d)?\\s*%' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Credit model parameters are proprietary and subject to fair-lending regulation.',
        keywords: ['LTV threshold', 'debt-to-income limit', 'loss given default',
                   'probability of default', 'expected loss model', 'scorecard cutoff',
                   'model override policy', 'adverse action reason'] },
    ]
  )

  // ── Security Division ────────────────────────────────────────────────────────

  await addSubject(tenantId,
    'CVEs & Vulnerability Disclosure',
    'Catches CVE identifiers, CVSS vectors, and exploit payloads before they hit public AI.',
    div['security']!, null, [
      // CVE IDs: CVE-2024-12345
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'CVE identifier detected — do not discuss unpatched vulnerabilities with AI tools.',
        pattern: '\\bCVE-\\d{4}-\\d{4,7}\\b' },
      // CVSS v3 vector strings: CVSS:3.1/AV:N/AC:L/...
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'CVSS vector string detected — vulnerability scoring data is security-sensitive.',
        pattern: 'CVSS:\\d\\.\\d\\/AV:[NALP]\\/AC:[LH]' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Vulnerability details must not be shared with AI assistants.',
        keywords: ['proof of concept exploit', 'RCE payload', 'privilege escalation path',
                   'SSRF chain', 'deserialization gadget', 'heap spray', 'ret2libc',
                   'pen test finding', 'responsible disclosure draft'] },
    ]
  )

  await addSubject(tenantId,
    'Active Threat Intelligence',
    'Blocks IOCs, C2 infrastructure details, and live incident data from external AI.',
    div['security']!, team['threat-intel']!, [
      // SHA-256 hashes (malware IOCs): 64 hex chars
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'File hash (possible malware IOC) detected — threat intel stays in TIP, not AI chat.',
        pattern: '\\b[0-9a-fA-F]{64}\\b' },
      // C2 domain indicators written as "C2: evil.example.com" in threat reports
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Possible C2 indicator detected — active threat data must not leave secure tooling.',
        pattern: '(?i)\\bC2\\s*[:\\-]\\s*[a-z0-9.-]+\\.[a-z]{2,}\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Live threat intelligence is operational security data — keep it in your TIP.',
        keywords: ['indicator of compromise', 'MITRE ATT&CK TTP', 'active incident',
                   'adversary infrastructure', 'dark web intelligence', 'IR playbook',
                   'diamond model analysis', 'kill chain stage'] },
    ]
  )

  await addSubject(tenantId,
    'Audit & Control Findings',
    'Blocks internal SOC 2 gaps, PCI-DSS failures, and management-letter findings.',
    div['security']!, team['compliance']!, [
      // SOC 2 report sections sometimes include "Control ID: CC6.1" style references
      { kind: 'pattern', action: 'block', reportLevel: 'rich',
        message: 'Audit control reference detected — findings are confidential until remediated.',
        pattern: '\\bCC\\d\\.\\d\\b|\\bCC[0-9]{4}\\b' },
      { kind: 'keyword', action: 'block', reportLevel: 'rich',
        message: 'Audit findings must not be disclosed externally before remediation.',
        keywords: ['control deficiency', 'material weakness', 'SOC 2 gap', 'management letter',
                   'ISO 27001 nonconformity', 'PCI DSS failure', 'exception noted',
                   'compensating control', 'qualified opinion'] },
    ]
  )

  console.log('✓ Created 18 subjects with rules across all divisions')

  // 8. Site configs (AI assistant sites the extension monitors)
  await db.insert(siteConfigs).values([
    {
      tenantId, domain: 'chatgpt.com',
      inputSelector: '#prompt-textarea',
      sendButtonSelector: 'button[data-testid="send-button"]',
    },
    {
      tenantId, domain: 'claude.ai',
      inputSelector: 'div[contenteditable="true"]',
      sendButtonSelector: 'button[aria-label="Send Message"]',
    },
    {
      tenantId, domain: 'gemini.google.com',
      inputSelector: 'div[contenteditable="true"]',
      sendButtonSelector: 'button[aria-label="Send message"]',
    },
    {
      tenantId, domain: 'copilot.microsoft.com',
      inputSelector: 'textarea#userInput',
      sendButtonSelector: 'button[aria-label="Submit message"]',
    },
  ])
  console.log('✓ Created site configs for ChatGPT · Claude · Gemini · Copilot')

  // 9. Compile & publish policy
  const policyDoc = await compilePolicy(tenantId)
  const version   = await publishPolicy(tenantId, policyDoc)
  console.log(`✓ Published policy v${version} (${policyDoc.subjects.length} subjects)`)

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`
╔════════════════════════════════════════════════════════════╗
║  FinCorp seed complete!                                    ║
╠════════════════════════════════════════════════════════════╣
║  5 divisions · 15 teams · 10 members · 18 subjects        ║
║  Policy v${version} published ✓                                  ║
╠════════════════════════════════════════════════════════════╣
║  Sign in to the extension as any member:                  ║
║  password → Fincorp2026!                                  ║
╠════════════════════════════════════════════════════════════╣`)
  for (const m of dummyDefs) {
    console.log(`║  ${m.email.padEnd(42)}  [${m.teamSlug.padEnd(16)}]  ║`)
  }
  console.log(`╚════════════════════════════════════════════════════════════╝`)

  void adminMemberId // used above
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
