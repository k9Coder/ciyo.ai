// Delete a user from the DB, along with any org they're the only member of.
//
// WHY THIS EXISTS: no FK into `users`/`tenants` cascades, so deleting a test
// account by hand (e.g. from the Neon table UI) fails on members_user_id_users_id_fk
// and the ~20 tenant-scoped tables. This deletes children-first in one
// transaction — all or nothing.
//
// SCOPE: only deletes tenants where this user is the SOLE member. If the user
// belongs to any org with other members, it refuses (removing one member from a
// shared org is a different operation). Tenants that weren't auto-provisioned
// (i.e. created by an admin, not self-serve) also need --force.
//
// Does NOT touch Clerk — it prints the Clerk user id to delete by hand at the
// end. Delete the DB rows first: Clerk's user.deleted webhook only nullifies.
//
// Tables missing from the target DB (schema.ts can be ahead of a DB's
// migrations) are skipped, not fatal.
//
// SAFE BY DEFAULT: dry-run unless --apply is passed.
//
// Usage:
//   npm run delete:user -- --user-id <uuid>            # dry-run
//   npm run delete:user -- --user-id <uuid> --apply
//   npm run delete:user -- --user-id <uuid> --apply --force
import 'dotenv/config'
import type { TransactionSql } from 'postgres'
import { sql } from '../db/client.js'

type Flags = { userId?: string; apply: boolean; force: boolean }

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, force: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') flags.apply = true
    else if (a === '--force') flags.force = true
    else if (a === '--user-id') flags.userId = argv[++i]
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1) }
  }
  return flags
}

function printHelp() {
  console.log(`delete-user — delete a DB user and any org they're the sole member of

  --user-id <uuid>    users.id to delete (required)
  --apply             write changes (default is dry-run)
  --force             also delete sole-member orgs that weren't auto-provisioned`)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Children before parents. Every table here has a tenant_id column.
const TENANT_TABLES_BEFORE_MEMBER_TEAMS = [
  'subject_versions', 'chat_sessions', 'events', 'scans', 'enforcement_signals',
  'shadow_verdicts', 'member_rule_exceptions', 'invites', 'desktop_auth_codes',
  'extension_auth_codes', 'device_tokens',
]
const TENANT_TABLES_AFTER_MEMBER_TEAMS = [
  'rules', 'members', 'destination_groups', 'subjects', 'teams', 'divisions',
  'site_configs', 'policies',
]

type Tx = TransactionSql

async function tableExists(tx: Tx, table: string): Promise<boolean> {
  const [row] = await tx`SELECT to_regclass(${table}) IS NOT NULL AS exists`
  return Boolean(row?.exists)
}

async function deleteTenant(tx: Tx, tenantId: string): Promise<void> {
  if (await tableExists(tx, 'chat_messages') && await tableExists(tx, 'chat_sessions')) {
    await tx`DELETE FROM chat_messages WHERE session_id IN (SELECT id FROM chat_sessions WHERE tenant_id = ${tenantId})`
  }
  for (const table of TENANT_TABLES_BEFORE_MEMBER_TEAMS) {
    if (!await tableExists(tx, table)) { console.log(`  skip missing table ${table}`); continue }
    await tx`DELETE FROM ${tx(table)} WHERE tenant_id = ${tenantId}`
  }
  if (await tableExists(tx, 'member_teams')) {
    await tx`DELETE FROM member_teams WHERE member_id IN (SELECT id FROM members WHERE tenant_id = ${tenantId})`
  }
  for (const table of TENANT_TABLES_AFTER_MEMBER_TEAMS) {
    if (!await tableExists(tx, table)) { console.log(`  skip missing table ${table}`); continue }
    await tx`DELETE FROM ${tx(table)} WHERE tenant_id = ${tenantId}`
  }
  await tx`DELETE FROM tenants WHERE id = ${tenantId}`
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.userId || !UUID_RE.test(flags.userId)) {
    console.error('--user-id <uuid> is required'); printHelp(); process.exit(1)
  }
  const userId = flags.userId

  const [user] = await sql<{ id: string; clerk_id: string | null; email: string }[]>`
    SELECT id, clerk_id, email FROM users WHERE id = ${userId}`
  if (!user) { console.error(`No user with id ${userId}`); process.exit(1) }

  const tenants = await sql<{ id: string; name: string; auto_provisioned: boolean; member_count: number }[]>`
    SELECT t.id, t.name, t.auto_provisioned,
           (SELECT count(*)::int FROM members m2 WHERE m2.tenant_id = t.id) AS member_count
    FROM members m JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = ${userId}`

  console.log(`[delete-user] user ${user.id} <${user.email}> clerk=${user.clerk_id ?? '(none)'}`)
  for (const t of tenants) {
    console.log(`  org ${t.id} "${t.name}" members=${t.member_count} auto_provisioned=${t.auto_provisioned}`)
  }

  const shared = tenants.filter(t => t.member_count > 1)
  if (shared.length > 0) {
    console.error(`Refusing: user belongs to ${shared.length} org(s) with other members — remove the membership from the console instead.`)
    process.exit(1)
  }
  const manual = tenants.filter(t => !t.auto_provisioned)
  if (manual.length > 0 && !flags.force) {
    console.error(`Refusing: ${manual.length} org(s) weren't auto-provisioned. Re-run with --force if you really mean to delete them.`)
    process.exit(1)
  }

  if (!flags.apply) {
    console.log(`[delete-user] dry-run — would delete ${tenants.length} org(s) and the user. Re-run with --apply.`)
    process.exit(0)
  }

  await sql.begin(async tx => {
    for (const t of tenants) {
      console.log(`[delete-user] deleting org ${t.id}`)
      await deleteTenant(tx, t.id)
    }
    if (await tableExists(tx, 'invites')) {
      await tx`UPDATE invites SET used_by_user_id = NULL WHERE used_by_user_id = ${userId}`
    }
    await tx`DELETE FROM users WHERE id = ${userId}`
  })

  console.log(`[delete-user] Done: deleted user ${user.id} and ${tenants.length} org(s).`)
  if (user.clerk_id) {
    console.log(`[delete-user] Now delete the Clerk user too: ${user.clerk_id} <${user.email}>`)
    console.log(`  Clerk dashboard → (matching instance) → Users → ${user.email} → Delete`)
  }
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
