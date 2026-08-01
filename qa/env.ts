import path from 'path'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: path.join(__dirname, process.env.QA_ENV_FILE ?? '.env.qa.staging') })

const schema = z.object({
  QA_CONSOLE_URL: z.string().url().optional(),
  QA_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  QA_CLERK_USER_EMAIL: z.string().min(1).optional(),
  QA_CLERK_USER_PASSWORD: z.string().min(1).optional(),
  CI: z.string().optional(),
})

export const env = schema.parse(process.env)

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key]
  if (!value) {
    throw new Error(
      `qa/${process.env.QA_ENV_FILE ?? '.env.qa.staging'} is missing ${key} — ` +
      `copy qa/.env.qa.example and fill it in.`
    )
  }
  return value as NonNullable<(typeof env)[K]>
}
