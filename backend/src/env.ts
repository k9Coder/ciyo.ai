import { z } from 'zod'

const schema = z.object({
  // Required — the server refuses to start without these.
  DATABASE_URL: z.string().min(1),
  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_WEBHOOK_SECRET: z.string().min(1),
  INTERNAL_SECRET: z.string().min(1),

  // Optional / defaulted.
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  APP_ENV: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  PRETZEL_CONSOLE_URL: z.string().default('https://pretzel-console.mykka.ai'),
  DB_POOL_MAX: z.coerce.number().int().positive().optional(),
  INTERNAL_API_URL: z.string().optional(),
  ADMIN_BASE_URL: z.string().optional(),
  PILOT_MODE: z.string().optional(),
  ASSISTANT_SEND_PII: z.string().optional(),

  LLM_PROVIDER: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_STARTER_PRICE_ID: z.string().optional(),
  STRIPE_BUSINESS_PRICE_ID: z.string().optional(),
  STRIPE_SUCCESS_URL: z.string().optional(),
  STRIPE_CANCEL_URL: z.string().optional(),

  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),
  PAYPAL_STARTER_PLAN_ID: z.string().optional(),
  PAYPAL_BUSINESS_PLAN_ID: z.string().optional(),
  PAYPAL_RETURN_URL: z.string().optional(),
  PAYPAL_CANCEL_URL: z.string().optional(),
  PAYPAL_SANDBOX: z.string().optional(),
  PAYPAL_SKIP_SIG_VERIFY: z.string().optional(),

  RATE_LIMIT_DISABLED: z.string().optional(),
  RATE_LIMIT_MAX: z.string().optional(),
  RATE_LIMIT_WINDOW: z.string().optional(),
})

// Fail fast at import: the server must not boot with a missing/invalid env.
const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid environment — fix .env or deployment config:\n${issues}`)
}

type Env = z.infer<typeof schema>

// Live read-through, not a frozen snapshot: integration tests mutate
// process.env at runtime (tests/helpers/setup.ts points INTERNAL_API_URL at the
// in-process app's ephemeral port; others flip NODE_ENV). Each access
// re-validates the single field so coercion and defaults still apply.
// Boolean-ish vars (RATE_LIMIT_DISABLED, PILOT_MODE, PAYPAL_SANDBOX, …) stay
// strings on purpose — call sites compare `=== 'true'`.
export const env = new Proxy({} as Env, {
  get(_target, key) {
    if (typeof key !== 'string' || !(key in schema.shape)) return undefined
    const field = schema.shape[key as keyof typeof schema.shape]
    const result = field.safeParse(process.env[key])
    if (!result.success) {
      throw new Error(`Invalid environment: ${key}: ${result.error.issues[0]?.message ?? 'invalid'}`)
    }
    return result.data
  },
}) as Env
