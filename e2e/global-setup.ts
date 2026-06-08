import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'
import { mkdirSync } from 'fs'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL is not set. Fill in e2e/.env.e2e.')
  }

  // Validate Clerk env vars up-front so a missing variable produces a clear
  // "missing env var" error rather than an opaque authentication failure deep
  // inside the seed script.
  const requiredClerkVars = [
    'E2E_CLERK_ORG_ID',
    'E2E_CLERK_USER_ID',
    'E2E_CLERK_USER_EMAIL',
  ] as const
  for (const varName of requiredClerkVars) {
    if (!process.env[varName]) {
      throw new Error(`${varName} is not set. Fill in e2e/.env.e2e.`)
    }
  }

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
        DATABASE_URL:         process.env.E2E_DATABASE_URL,
        E2E_CLERK_ORG_ID:     process.env.E2E_CLERK_ORG_ID!,
        E2E_CLERK_USER_ID:    process.env.E2E_CLERK_USER_ID!,
        E2E_CLERK_USER_EMAIL: process.env.E2E_CLERK_USER_EMAIL!,
      },
    })
  } catch (err) {
    throw new Error(
      `[e2e] Database seed failed. Check that DATABASE_URL is correct and the DB is reachable.\n${String(err)}`
    )
  }
  console.log('[e2e] Seed complete.')
}
