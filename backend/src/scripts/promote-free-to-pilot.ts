// Move existing free-plan tenants onto the pilot plan.
//
// WHY THIS EXISTS: PILOT_MODE only decides the plan of tenants created AFTER it
// is switched on (me/service.ts, billing/service.ts). Tenants that signed up
// earlier stay on `free` (3 seats, 500 scans/month, keyword rules only) and hit
// those limits during early access.
//
// Only tenants with no payment provider are touched, so nothing that is paid for
// is ever changed. Idempotent — re-running finds nothing left to promote.
//
// SAFE BY DEFAULT: dry-run unless --apply is passed.
//
// Usage:
//   npm run promote:free-to-pilot              # dry-run, lists tenants
//   npm run promote:free-to-pilot -- --apply   # write
import 'dotenv/config'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'

async function main() {
  const apply = process.argv.includes('--apply')

  const candidates = await db
    .select({ id: tenants.id, name: tenants.name, createdAt: tenants.createdAt })
    .from(tenants)
    .where(and(eq(tenants.plan, 'free'), isNull(tenants.paymentProvider)))

  console.log(`[promote-free-to-pilot] ${candidates.length} free tenant(s) with no payment provider`)
  for (const t of candidates) {
    console.log(`  ${apply ? '✔' : '•'} ${t.id}  ${t.createdAt.toISOString().slice(0, 10)}  ${t.name}`)
  }

  if (!apply) {
    console.log('\n[promote-free-to-pilot] dry-run. Re-run with --apply to write.')
    process.exit(0)
  }

  const updated = await db
    .update(tenants)
    .set({ plan: 'pilot' })
    .where(and(eq(tenants.plan, 'free'), isNull(tenants.paymentProvider)))
    .returning({ id: tenants.id })

  console.log(`\n[promote-free-to-pilot] promoted ${updated.length} tenant(s) to pilot.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
