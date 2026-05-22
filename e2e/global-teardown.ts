import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalTeardown() {
  console.log('[e2e] Tearing down test database...')
  execSync('pnpm run teardown:e2e', {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
  })
  console.log('[e2e] Teardown complete.')
}
