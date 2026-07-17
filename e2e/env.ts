import path from 'path'
import { config } from 'dotenv'
import { z } from 'zod'

// Load local .env.e2e first (no-op in CI where vars come from the workflow).
config({ path: path.join(__dirname, '.env.e2e') })

const schema = z.object({
  E2E_DATABASE_URL: z.string().min(1),
  E2E_ADMIN_URL: z.string().default('http://localhost:5173'),
  E2E_BACKEND_URL: z.string().default('http://localhost:3000'),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().optional(),
  E2E_CLERK_USER_ID: z.string().min(1),
  E2E_CLERK_ORG_ID: z.string().min(1),
  E2E_CLERK_USER_EMAIL: z.string().min(1),
  E2E_CLERK_USER_PASSWORD: z.string().optional(),
  CI: z.string().optional(),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`e2e environment invalid — fill in e2e/.env.e2e:\n${issues}`)
}

export const env = parsed.data
