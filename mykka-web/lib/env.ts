import { z } from 'zod'

const schema = z.object({
  NEXT_PUBLIC_API_BASE: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default('https://app.mykka.ai'),
  NEXT_PUBLIC_ENV: z.string().optional(),
  NEXT_PUBLIC_PILOT_MODE: z.string().optional(),
  NEXT_PUBLIC_LOGROCKET_ID: z.string().optional(),
})

// Next.js inlines NEXT_PUBLIC_* at build time — every var MUST be referenced
// literally (never via a dynamic key), or the value will be undefined in the bundle.
export const env = schema.parse({
  NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
  NEXT_PUBLIC_PILOT_MODE: process.env.NEXT_PUBLIC_PILOT_MODE,
  NEXT_PUBLIC_LOGROCKET_ID: process.env.NEXT_PUBLIC_LOGROCKET_ID,
})
