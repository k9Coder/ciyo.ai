import { execSync } from 'child_process'
import path from 'path'
import { mkdirSync } from 'fs'
// env.ts loads .env.e2e and fail-fasts with a clear message on any missing
// required var (DB URL, Clerk ids) before the seed script can fail opaquely.
import { env } from './env'

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalSetup() {
  // NOTE: the fixture server at http://localhost:9876 must be started separately
  // before running the cross-cutting suite (it is started automatically by
  // `pnpm test:e2e` inside the pretzel package). The globalSetup does not start
  // it because it is also needed for the extension E2E project.

  mkdirSync(path.join(__dirname, '.auth'), { recursive: true })

  console.log('[e2e] Seeding test database...')
  try {
    execSync('pnpm run seed:e2e', {
      cwd: BACKEND_DIR,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL:         env.E2E_DATABASE_URL,
        E2E_CLERK_ORG_ID:     env.E2E_CLERK_ORG_ID,
        E2E_CLERK_USER_ID:    env.E2E_CLERK_USER_ID,
        E2E_CLERK_USER_EMAIL: env.E2E_CLERK_USER_EMAIL,
      },
    })
  } catch (err) {
    throw new Error(
      `[e2e] Database seed failed. Check that DATABASE_URL is correct and the DB is reachable.\n${String(err)}`
    )
  }
  console.log('[e2e] Seed complete.')
}
