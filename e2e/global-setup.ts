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

  mkdirSync(path.join(__dirname, '.auth'), { recursive: true })

  console.log('[e2e] Seeding test database...')
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
  console.log('[e2e] Seed complete.')
}
