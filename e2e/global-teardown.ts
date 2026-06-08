import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'
import { writeFileSync } from 'fs'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalTeardown() {
  console.log('[e2e] Tearing down test database...')
  try {
    execSync('pnpm run teardown:e2e', {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
    })
  } catch (err) {
    // Log but do not rethrow — a failed teardown should not mask test results.
    // The stale-state warning below ensures accidental partial runs fail fast.
    console.error(`[e2e] WARNING: teardown script failed. DB may contain leftover test data.\n${String(err)}`)
  }

  // Overwrite .seed-state.json with an empty sentinel so that a subsequent
  // partial run (without globalSetup) fails fast with a parse error rather
  // than silently using stale tokens that no longer exist in the DB.
  try {
    writeFileSync(path.join(__dirname, '.seed-state.json'), '{}', 'utf-8')
  } catch {
    // Non-fatal: the file may not exist on the first run
  }

  console.log('[e2e] Teardown complete.')
}
