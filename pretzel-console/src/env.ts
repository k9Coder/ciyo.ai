import { z } from 'zod'

const shape = {
  VITE_API_BASE: z.string().default('http://localhost:3000'),
  // Default '' — this parse runs in the browser at bundle eval; ClerkProvider
  // throws its own clear error at runtime if the key is empty. Console unit
  // tests run in CI with no env at all, so a hard requirement would fail them.
  VITE_CLERK_PUBLISHABLE_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_APP_ENV: z.string().optional(),
  VITE_LOGROCKET_ID: z.string().optional(),
  VITE_FEATURE_ONBOARDING_BADGE: z.string().optional(),
}

// Live getters, not a frozen snapshot: tests stub import.meta.env at runtime
// (vi.stubEnv). Each getter references its var literally so Vite's static
// replacement still inlines values in production builds.
export const env = {
  get VITE_API_BASE() {
    return shape.VITE_API_BASE.parse(import.meta.env.VITE_API_BASE)
  },
  get VITE_CLERK_PUBLISHABLE_KEY() {
    return shape.VITE_CLERK_PUBLISHABLE_KEY.parse(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY)
  },
  get VITE_SENTRY_DSN() {
    return shape.VITE_SENTRY_DSN.parse(import.meta.env.VITE_SENTRY_DSN)
  },
  get VITE_APP_ENV() {
    return shape.VITE_APP_ENV.parse(import.meta.env.VITE_APP_ENV)
  },
  get VITE_LOGROCKET_ID() {
    return shape.VITE_LOGROCKET_ID.parse(import.meta.env.VITE_LOGROCKET_ID)
  },
  get VITE_FEATURE_ONBOARDING_BADGE() {
    return shape.VITE_FEATURE_ONBOARDING_BADGE.parse(import.meta.env.VITE_FEATURE_ONBOARDING_BADGE)
  },
}

export const MODE = import.meta.env.MODE
