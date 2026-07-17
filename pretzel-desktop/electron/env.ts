import { z } from 'zod'

const shape = {
  CIYO_API_URL: z.string().default('https://api.ciyo.ai'),
  CLERK_PUBLISHABLE_KEY: z.string().default(''),
}

// The two process.env references below are statically replaced at build time
// by the `define` block in electron.vite.config.ts — a packaged app never sees
// real env vars for them. Reference literally; never via a dynamic key.
// Live getters so dev/test runs that set real env vars keep working.
export const env = {
  get CIYO_API_URL() {
    return shape.CIYO_API_URL.parse(process.env.CIYO_API_URL || undefined)
  },
  get CLERK_PUBLISHABLE_KEY() {
    return shape.CLERK_PUBLISHABLE_KEY.parse(process.env.CLERK_PUBLISHABLE_KEY || undefined)
  },
}
