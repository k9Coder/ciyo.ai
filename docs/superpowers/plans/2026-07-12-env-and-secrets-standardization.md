# Env & Secrets Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefixed GitHub secrets scoped via GitHub Environments (`production`/`staging`), standardized `.env` file trio per package, and one zod-validated `env.ts` per package replacing scattered raw env reads.

**Architecture:** Secrets are renamed only at the GitHub layer; workflows map them to unchanged runtime var names and declare `environment:` per job. Each package gets a single env module that parses its env source (process.env or import.meta.env) with zod at import time. Server-side modules (backend, e2e) are strict fail-fast; client-bundle modules (Vite/Next/desktop) use defaults because their parse runs at browser/app runtime, not build.

**Tech Stack:** GitHub Actions Environments, zod (v3 backend/pretzel/desktop, v4 console; add to mykka-web + e2e), electron-vite `define` + `loadEnv`, dotenv (e2e).

**Spec:** `docs/superpowers/specs/2026-07-11-env-and-secrets-standardization-design.md`

## Global Constraints

- Prefix exists ONLY at the GitHub secrets layer. Runtime env var names, `.env` file keys, and Render/Vercel dashboard vars are unchanged.
- One job = one `environment:`. No job reads secrets from both environments.
- Test-axis files untouched: `backend/.env.test`, `e2e/.env.e2e` wiring, CI postgres service containers, hardcoded dummy creds (`test-secret`, `test-secret-e2e-32chars-minimum-xxxx`, `postgres://e2e:e2e@...`) all stay exactly as-is.
- New dependencies: zod added to `mykka-web` and `e2e` only. No other new deps.
- Backend allowlist for raw `process.env` reads (standalone scripts run with partial env — DATABASE_URL only in CI): `src/db/client.ts`, `src/db/migrate.ts`, `src/db/seeds/**`, `src/scripts/**`. Everything else in `backend/src` imports from `src/env.ts`.
- Backend uses ESM with `.js` import suffixes (`import { env } from './env.js'`).
- Work happens on branch `chore/env-secrets-standardization` (already exists, spec committed).
- MANUAL PREREQUISITE (Yarin, GitHub UI — before this PR merges, not before implementation): create `production` + `staging` environments and add new-name secrets per the rename map in the spec. Old secrets are deleted only after green runs.

---

### Task 1: Backend `src/env.ts` with zod validation

**Files:**
- Create: `backend/src/env.ts`
- Create: `backend/src/env.test.ts`

**Interfaces:**
- Produces: `env` object — typed strings/numbers; consumers use `env.DATABASE_URL`, `env.PORT` (number), `env.CLERK_SECRET_KEY`, etc. All values below.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/env.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// vitest loads backend/.env.test (see vitest.config.ts `env:`), so required
// vars are present by default; individual tests knock them out via stubEnv.
describe('env', () => {
  beforeEach(() => vi.resetModules())
  afterEach(() => vi.unstubAllEnvs())

  it('parses a valid environment with defaults applied', async () => {
    const { env } = await import('./env.js')
    expect(env.DATABASE_URL).toContain('postgres')
    expect(env.PORT).toBe(3000)
    expect(env.NODE_ENV).toBe('test')
  })

  it('throws naming the missing required var', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', '')
    await expect(import('./env.js')).rejects.toThrow(/CLERK_SECRET_KEY/)
  })

  it('coerces numeric vars', async () => {
    vi.stubEnv('PORT', '8080')
    const { env } = await import('./env.js')
    expect(env.PORT).toBe(8080)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter pretzel-api exec vitest run src/env.test.ts`
Expected: FAIL — cannot resolve `./env.js`.

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/env.ts
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

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`Invalid environment — fix .env or deployment config:\n${issues}`)
}

export const env = parsed.data
```

Note: boolean-ish vars (`RATE_LIMIT_DISABLED`, `PILOT_MODE`, `PAYPAL_SANDBOX`, …) stay strings on purpose — call sites compare `=== 'true'` today and Task 2 must not change comparison semantics.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter pretzel-api exec vitest run src/env.test.ts`
Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/env.ts backend/src/env.test.ts
git commit -m "feat(backend): add zod-validated fail-fast env module"
```

---

### Task 2: Migrate backend env reads to `env.ts`

**Files:**
- Modify: every file in `backend/src` with a `process.env` read EXCEPT the allowlist (`src/db/client.ts`, `src/db/migrate.ts`, `src/db/seeds/**`, `src/scripts/**`). Known files: `src/index.ts`, `src/app.ts`, `src/auth/middleware.ts`, `src/me/router.ts`, `src/webhooks/clerk.ts`, `src/invites/router.ts`, `src/billing/email.ts`, `src/billing/stripe.ts`, `src/billing/paypal.ts` (PAYPAL_* reads — confirm exact path via the grep in Step 1), `src/http/internal-client.ts`, `src/internal/**` (INTERNAL_SECRET), `src/assistant/prompt.ts`, `src/assistant/llm/{index,groq,anthropic,openai}.ts`, plus any others the grep finds (RATE_LIMIT_* location, CORS in app.ts).

**Interfaces:**
- Consumes: `env` from Task 1.
- Produces: no raw `process.env` in backend/src outside allowlist.

- [ ] **Step 1: Enumerate every read**

Run: `grep -rnE "process\.env(\.[A-Z_0-9]+|\[)" backend/src --include="*.ts" | grep -vE "src/env\.(ts|test\.ts)|db/client\.ts|db/migrate\.ts|db/seeds/|scripts/"`
This is the authoritative worklist (≈20 files).

- [ ] **Step 2: Replace each read mechanically**

Pattern — both access styles map to the same replacement:
- `process.env.X` → `env.X`
- `process.env['X']` → `env.X`
- `process.env['X']!` / `process.env.X!` → `env.X` (drop the assertion; zod guarantees required vars)
- Add `import { env } from '<relative>/env.js'` to each touched file.
- Keep existing fallback expressions only where the schema does not already encode them. Two worked examples:

```ts
// src/index.ts — before
const port = Number(process.env['PORT'] ?? 3000)
const appEnv = process.env['APP_ENV']
// after
import { env } from './env.js'
const port = env.PORT
const appEnv = env.APP_ENV
```

```ts
// src/webhooks/clerk.ts — before
const secret = process.env.CLERK_WEBHOOK_SECRET
...process.env.PILOT_MODE === 'true'
// after
import { env } from '../env.js'
const secret = env.CLERK_WEBHOOK_SECRET
...env.PILOT_MODE === 'true'
```

Do NOT touch `NODE_ENV` reads inside the allowlisted files; migrated files use `env.NODE_ENV`.

- [ ] **Step 3: Verify no reads remain**

Run the Step 1 grep again.
Expected: empty output.

- [ ] **Step 4: Run backend suite + typecheck**

Run: `pnpm --filter pretzel-api test` and `pnpm --filter pretzel-api exec tsc --noEmit`
Expected: all green. If a test constructs the app with a hand-rolled env, `.env.test` already supplies the four required vars — failures here mean a test mutates `process.env` after `env.ts` import; fix that test to use `vi.stubEnv` + `vi.resetModules`.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "refactor(backend): route all env access through validated env module"
```

---

### Task 3: mykka-web env module + `.env.example`

**Files:**
- Create: `mykka-web/lib/env.ts`, `mykka-web/.env.example`
- Modify: `mykka-web/package.json` (zod dep), `mykka-web/lib/config.ts`, `mykka-web/components/layout/Header.tsx:39`, `mykka-web/components/LogRocketInit.tsx:7`

**Interfaces:**
- Produces: `env` with `NEXT_PUBLIC_API_BASE?`, `NEXT_PUBLIC_APP_URL` (default `https://app.mykka.ai`), `NEXT_PUBLIC_ENV?`, `NEXT_PUBLIC_PILOT_MODE?`, `NEXT_PUBLIC_LOGROCKET_ID?` — all strings.

- [ ] **Step 1: Add zod**

Run: `pnpm add zod` (cwd `mykka-web`). Expected: zod in dependencies.

- [ ] **Step 2: Create env module**

```ts
// mykka-web/lib/env.ts
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
```

- [ ] **Step 3: Migrate the three consumers**

```ts
// lib/config.ts — entire file becomes
import { env } from './env'
export const APP_URL = env.NEXT_PUBLIC_APP_URL
export const IS_PILOT_MODE = env.NEXT_PUBLIC_PILOT_MODE === 'true'
```

```tsx
// components/layout/Header.tsx:39 — `process.env.NEXT_PUBLIC_ENV === 'staging'`
// becomes (add `import { env } from '@/lib/env'` — match the file's existing import alias style)
{env.NEXT_PUBLIC_ENV === 'staging' && (
```

```tsx
// components/LogRocketInit.tsx:7 — `const id = process.env['NEXT_PUBLIC_LOGROCKET_ID']`
// becomes
const id = env.NEXT_PUBLIC_LOGROCKET_ID
```

- [ ] **Step 4: Create `.env.example`**

```bash
# mykka-web/.env.example
# Copied to .env.local by: pnpm set-env:staging | pnpm set-env:prod (from monorepo root)
NEXT_PUBLIC_API_BASE=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:5173
NEXT_PUBLIC_ENV=
NEXT_PUBLIC_PILOT_MODE=
NEXT_PUBLIC_LOGROCKET_ID=
```

- [ ] **Step 5: Verify build + grep**

Run: `pnpm build` (cwd `mykka-web`) — expected: success.
Run: `grep -rnE "process\.env" mykka-web/app mykka-web/lib mykka-web/components --include="*.ts" --include="*.tsx" | grep -v "lib/env.ts"` — expected: empty.

- [ ] **Step 6: Commit**

```bash
git add mykka-web
git commit -m "feat(mykka-web): validated env module + .env.example"
```

---

### Task 4: pretzel (extension) env module

**Files:**
- Create: `pretzel/src/env.ts`
- Modify: `pretzel/src/shared/constants.ts`, `pretzel/src/lib/sentry.ts`, `pretzel/src/shared/logger.ts`

**Interfaces:**
- Produces: `env.VITE_API_BASE` (default `https://api.mykka.ai`), `env.VITE_CLERK_PUBLISHABLE_KEY` (default `''`), `env.VITE_SENTRY_DSN_EXTENSION?`, plus `IS_DEV: boolean`, `MODE: string`. `constants.ts` keeps exporting `API_BASE` / `CLERK_PUBLISHABLE_KEY` so downstream imports don't churn.

- [ ] **Step 1: Create env module**

```ts
// pretzel/src/env.ts
import { z } from 'zod'

const schema = z.object({
  VITE_API_BASE: z.string().default('https://api.mykka.ai'),
  // Default '' (not required): this parse runs in the browser at bundle eval,
  // so a hard throw would brick the extension instead of failing the build.
  // Clerk init surfaces the missing key loudly at runtime.
  VITE_CLERK_PUBLISHABLE_KEY: z.string().default(''),
  VITE_SENTRY_DSN_EXTENSION: z.string().optional(),
})

// Vite statically replaces import.meta.env.* — reference each var literally.
export const env = schema.parse({
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_SENTRY_DSN_EXTENSION: import.meta.env.VITE_SENTRY_DSN_EXTENSION,
})

export const IS_DEV = import.meta.env.DEV
export const MODE = import.meta.env.MODE
```

- [ ] **Step 2: Migrate consumers**

```ts
// src/shared/constants.ts — the two env lines become
import { env } from '../env'
export const API_BASE = env.VITE_API_BASE
export const CLERK_PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY
```

```ts
// src/lib/sentry.ts — lines 4 and 9 become
import { env, MODE } from '../env'
const dsn = env.VITE_SENTRY_DSN_EXTENSION
...
environment: MODE,
```

```ts
// src/shared/logger.ts — line 2 becomes
import { IS_DEV } from '../env'
const IS_DEV_LOCAL = IS_DEV  // or use IS_DEV directly; keep exported name stable
```

(If `logger.ts` just does `const IS_DEV = import.meta.env.DEV`, replace with the import and delete the local const.)

- [ ] **Step 3: Verify**

Run: `pnpm --filter pretzel-extension test` and `pnpm --filter pretzel-extension exec tsc --noEmit` (use the package's existing typecheck script if one exists).
Run: `grep -rn "import\.meta\.env" pretzel/src | grep -v "src/env.ts"` — expected: empty.

- [ ] **Step 4: Commit**

```bash
git add pretzel/src
git commit -m "feat(pretzel): centralize import.meta.env access in env module"
```

---

### Task 5: pretzel-console env module

**Files:**
- Create: `pretzel-console/src/env.ts`
- Modify: `pretzel-console/src/lib/api.ts`, `pretzel-console/src/main.tsx`, `pretzel-console/src/lib/sentry.ts`, `pretzel-console/src/components/layout/AppLayout.tsx` (lines 15, 154)

**Interfaces:**
- Produces: `env.VITE_API_BASE` (default `http://localhost:3000` — preserves api.ts fallback), `env.VITE_CLERK_PUBLISHABLE_KEY` (default `''`), `env.VITE_SENTRY_DSN?`, `env.VITE_APP_ENV?`, `env.VITE_LOGROCKET_ID?`, `env.VITE_FEATURE_ONBOARDING_BADGE?`, `MODE: string`.

- [ ] **Step 1: Create env module** (console has zod v4 — this syntax works on both)

```ts
// pretzel-console/src/env.ts
import { z } from 'zod'

const schema = z.object({
  VITE_API_BASE: z.string().default('http://localhost:3000'),
  // Default '' — parse runs in the browser; ClerkProvider throws a clear error
  // at runtime if empty. CI console unit tests run with no env at all.
  VITE_CLERK_PUBLISHABLE_KEY: z.string().default(''),
  VITE_SENTRY_DSN: z.string().optional(),
  VITE_APP_ENV: z.string().optional(),
  VITE_LOGROCKET_ID: z.string().optional(),
  VITE_FEATURE_ONBOARDING_BADGE: z.string().optional(),
})

export const env = schema.parse({
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  VITE_CLERK_PUBLISHABLE_KEY: import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_SENTRY_DSN: import.meta.env.VITE_SENTRY_DSN,
  VITE_APP_ENV: import.meta.env.VITE_APP_ENV,
  VITE_LOGROCKET_ID: import.meta.env.VITE_LOGROCKET_ID,
  VITE_FEATURE_ONBOARDING_BADGE: import.meta.env.VITE_FEATURE_ONBOARDING_BADGE,
})

export const MODE = import.meta.env.MODE
```

Note: api.ts's `typeof import.meta !== 'undefined'` guard exists for non-Vite contexts (vitest). Vitest processes the file through Vite, so `import.meta.env` is defined; the guard is dropped. If a console unit test fails on `import.meta.env` being undefined, add `test: { environment: 'jsdom' }`-level env via the package's vite config rather than reintroducing the guard.

- [ ] **Step 2: Migrate consumers**

```ts
// src/lib/api.ts — lines 1-3 become
import { env } from '../env'
export const API_BASE = env.VITE_API_BASE
```

```tsx
// src/main.tsx — lines 5 and 17 become
import { env } from './env'
const LOGROCKET_ID = env.VITE_LOGROCKET_ID
const CLERK_KEY = env.VITE_CLERK_PUBLISHABLE_KEY
```

```ts
// src/lib/sentry.ts — line 4 becomes (also replace any import.meta.env.MODE here with MODE)
import { env, MODE } from '../env'
const dsn = env.VITE_SENTRY_DSN
```

```tsx
// src/components/layout/AppLayout.tsx — lines 15 and 154 become
import { env } from '../../env'
const ONBOARDING_BADGE_ENABLED = env.VITE_FEATURE_ONBOARDING_BADGE === 'true'
...
{env.VITE_APP_ENV === 'staging' && (
```

- [ ] **Step 3: Verify**

Run: `pnpm --filter pretzel-console test` and `pnpm --filter pretzel-console typecheck`
Run: `grep -rn "import\.meta\.env" pretzel-console/src | grep -v "src/env.ts"` — expected: empty.

- [ ] **Step 4: Commit**

```bash
git add pretzel-console/src
git commit -m "feat(console): centralize import.meta.env access in env module"
```

---

### Task 6: pretzel-desktop — bake env at build, env module, `.env` files, set-env

**Files:**
- Modify: `pretzel-desktop/electron.vite.config.ts`, `pretzel-desktop/electron/auth.ts:148-149`, `pretzel-desktop/electron/policy-sync.ts:12`, `scripts/set-env.mjs`
- Create: `pretzel-desktop/electron/env.ts`, `pretzel-desktop/.env.example`, `pretzel-desktop/.env.staging`

**Interfaces:**
- Produces: `env.MYKKA_API_URL` (default `https://api.mykka.ai`), `env.CLERK_PUBLISHABLE_KEY` (default `''`). `NODE_ENV` reads in `main.ts`/`decision-window.ts` stay raw (electron-vite dev-mode signal — allowlisted).

Background (latent bug this fixes): main-process code reads `process.env.MYKKA_API_URL` at runtime, but a packaged app has no such env var — the CI build secret currently has no effect and the `https://api.mykka.ai` fallback is doing all the work; `CLERK_PUBLISHABLE_KEY` silently falls back to `''`. `define` bakes build-time values into the bundle so the CI secrets actually land.

- [ ] **Step 1: Rewrite `electron.vite.config.ts` with define + loadEnv**

```ts
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Precedence: real process env (CI secrets) > .env.[mode] / .env files > baked undefined
  const fileEnv = loadEnv(mode, __dirname, '')
  const baked = (key: string) => {
    const v = process.env[key] ?? fileEnv[key]
    return v ? JSON.stringify(v) : 'undefined'
  }

  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        'process.env.MYKKA_API_URL': baked('MYKKA_API_URL'),
        'process.env.CLERK_PUBLISHABLE_KEY': baked('CLERK_PUBLISHABLE_KEY'),
      },
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          input: { main: resolve(__dirname, 'electron/main.ts') },
        },
      },
    },
    preload: {
      plugins: [externalizeDepsPlugin()],
      build: {
        outDir: 'dist-electron',
        rollupOptions: {
          input: { preload: resolve(__dirname, 'electron/preload.ts') },
        },
      },
    },
    renderer: {
      root: 'renderer',
      build: {
        outDir: 'dist/renderer',
        rollupOptions: {
          input: {
            'tray-ui': resolve(__dirname, 'renderer/tray-ui/index.html'),
            'decision-ui': resolve(__dirname, 'renderer/decision-ui/index.html'),
          },
        },
      },
      plugins: [react()],
    },
  }
})
```

If `loadEnv` is not re-exported by the installed electron-vite version, import it from `vite` instead — same signature.

- [ ] **Step 2: Create `electron/env.ts`**

```ts
// pretzel-desktop/electron/env.ts
import { z } from 'zod'

const schema = z.object({
  MYKKA_API_URL: z.string().default('https://api.mykka.ai'),
  CLERK_PUBLISHABLE_KEY: z.string().default(''),
})

// These two process.env references are statically replaced at build by the
// `define` block in electron.vite.config.ts — a packaged app never sees real
// env vars for them. Reference literally; never via dynamic key.
export const env = schema.parse({
  MYKKA_API_URL: process.env.MYKKA_API_URL,
  CLERK_PUBLISHABLE_KEY: process.env.CLERK_PUBLISHABLE_KEY,
})
```

- [ ] **Step 3: Migrate consumers**

```ts
// electron/auth.ts:148-149 — becomes
import { env } from './env'
const MYKKA_API_BASE = env.MYKKA_API_URL
const CLERK_PUBLISHABLE_KEY = env.CLERK_PUBLISHABLE_KEY
```

```ts
// electron/policy-sync.ts:12 — becomes
import { env } from './env'
const MYKKA_API_BASE = env.MYKKA_API_URL
```

- [ ] **Step 4: Create `.env.example` and `.env.staging`**

```bash
# pretzel-desktop/.env.example
# Local dev: copy to .env (or run: pnpm set-env:staging from monorepo root).
# Baked into the main-process bundle at build time via electron.vite.config.ts define.
MYKKA_API_URL=http://localhost:3000
CLERK_PUBLISHABLE_KEY=pk_test_...
```

```bash
# pretzel-desktop/.env.staging
# Staging/dev Clerk instance — test keys only, safe to commit.
MYKKA_API_URL=http://localhost:3000
CLERK_PUBLISHABLE_KEY=pk_test_cGxlYXNlZC1jbGFtLTI1LmNsZXJrLmFjY291bnRzLmRldiQ
```

(`.env.prod` is gitignored via existing `**/.env.prod`; Yarin creates it locally with prod values — noted in the docs task checklist.)

- [ ] **Step 5: Add desktop to `scripts/set-env.mjs`**

In the `copies` array add:

```js
  { pkg: "pretzel-desktop", src: `.env.${env}`, dest: ".env" },
```

And extend the trailing console output block with:

```js
console.log(`  pretzel-desktop: .env copied — rebuild with pnpm build (values are baked at build time)`);
```

- [ ] **Step 6: Verify**

Run: `pnpm --filter pretzel-desktop test` — expected: green.
Run: `pnpm --filter pretzel-desktop build`, then `grep -o "https://api.mykka.ai" pretzel-desktop/dist-electron/main.js | head -1` — expected: the default URL appears (define left fallback intact when no env set).
Run: `node scripts/set-env.mjs staging` from repo root — expected output includes `pretzel-desktop/.env  ←  .env.staging`.

- [ ] **Step 7: Commit**

```bash
git add pretzel-desktop scripts/set-env.mjs
git commit -m "feat(desktop): bake MYKKA_API_URL/CLERK_PUBLISHABLE_KEY at build; add .env files"
```

---

### Task 7: e2e env module

**Files:**
- Create: `e2e/env.ts`
- Modify: `e2e/package.json` (zod dep), `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `e2e/playwright.config.ts`, files under `e2e/helpers/` and `e2e/extension/` with `process.env` reads, `e2e/.env.e2e.example` (stale comment)

**Interfaces:**
- Produces: `env` with required `E2E_DATABASE_URL`, `CLERK_SECRET_KEY`, `E2E_CLERK_USER_ID`, `E2E_CLERK_ORG_ID`, `E2E_CLERK_USER_EMAIL`; defaulted `E2E_ADMIN_URL` (`http://localhost:5173`), `E2E_BACKEND_URL` (`http://localhost:3000`); optional `CLERK_PUBLISHABLE_KEY`, `E2E_CLERK_USER_PASSWORD`, `CI`.

- [ ] **Step 1: Add zod**

Run: `pnpm add -D zod` (cwd `e2e`).

- [ ] **Step 2: Create env module**

```ts
// e2e/env.ts
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
```

- [ ] **Step 3: Migrate consumers**

- `global-setup.ts`: delete the `config({ path: ... })` call, the `E2E_DATABASE_URL` throw, and the `requiredClerkVars` loop (env.ts now does all of it); replace remaining `process.env.X` with `env.X` via `import { env } from './env'`. Where a child process needs the vars (the `execSync` seed call passes `DATABASE_URL: process.env.E2E_DATABASE_URL`), use `env.E2E_DATABASE_URL` but keep spreading `...process.env` into the child env.
- `global-teardown.ts`: same treatment.
- `playwright.config.ts`, `helpers/**`, `extension/**`: replace `process.env.E2E_*` / `process.env.CLERK_*` reads with `env.X`. `process.env.CI` may stay raw (playwright convention) — allowlisted.
- `.env.e2e.example` line 1: replace `# Test database — separate from production (create in Railway)` with `# Test database — separate from production (create a dedicated Neon database)`.

- [ ] **Step 4: Verify**

Run: `grep -rnE "process\.env\.(E2E|CLERK)[A-Z_]*" e2e --include="*.ts" | grep -v node_modules | grep -v "e2e/env.ts"` — expected: empty.
Run: `pnpm exec playwright test --list` (cwd `e2e`, with a filled `.env.e2e`) — expected: test list prints, no env errors. If no local `.env.e2e` is available, `pnpm exec tsc --noEmit` (cwd `e2e`) is the fallback check.

- [ ] **Step 5: Commit**

```bash
git add e2e
git commit -m "feat(e2e): zod-validated env module; fix stale Railway reference"
```

---

### Task 8: Deploy workflows → environments + renamed secrets

**Files:**
- Modify: `.github/workflows/backend-deploy.yml`, `.github/workflows/pretzel-console-deploy.yml`, `.github/workflows/mykka-web-deploy.yml`

- [ ] **Step 1: backend-deploy.yml**

On the deploy job (the one containing "Build and push image" / "Run DB migrations" / "Deploy to Render"), add directly under `runs-on:`:

```yaml
    environment: ${{ github.ref_name == 'master' && 'production' || 'staging' }}
```

Then replace secret refs:

```yaml
      # Run DB migrations + Seed profession templates steps — both:
        env:
          DATABASE_URL: ${{ secrets.BACKEND_DATABASE_URL }}

      # Deploy to Render step:
        env:
          SERVICE_ID: ${{ secrets.BACKEND_RENDER_SERVICE_ID }}
          RENDER_API_KEY: ${{ secrets.SHARED_RENDER_API_KEY }}

      # Notify Discord step:
          webhook: ${{ secrets.SHARED_DISCORD_WEBHOOK_URL }}
```

The `github.ref_name == 'master' && secrets.PROD_X || secrets.STAGING_X` ternaries are deleted — the environment picks the value. Test job: untouched.

- [ ] **Step 2: pretzel-console-deploy.yml**

Deploy job: add the same `environment:` ternary line under `runs-on:`. Replace the `DEPLOY_HOOK` env line and error message:

```yaml
      - name: Trigger Render deploy
        env:
          DEPLOY_HOOK: ${{ secrets.CONSOLE_RENDER_DEPLOY_HOOK }}
        run: |
          if [ -z "$DEPLOY_HOOK" ]; then
            echo "::error::CONSOLE_RENDER_DEPLOY_HOOK is not set in the ${{ github.ref_name == 'master' && 'production' || 'staging' }} environment. Create the deploy hook in the Render dashboard and add it as an environment secret."
            exit 1
          fi
          curl --silent --output /dev/null --fail -X POST "$DEPLOY_HOOK"
```

Discord webhook → `SHARED_DISCORD_WEBHOOK_URL`. Test job: untouched.

- [ ] **Step 3: mykka-web-deploy.yml**

Only change: `DISCORD_WEBHOOK_URL` → `SHARED_DISCORD_WEBHOOK_URL`. (Deploys via Vercel; no other GitHub secrets.)

- [ ] **Step 4: Validate + commit**

Run: `pnpm exec yaml-lint .github/workflows/*.yml 2>/dev/null || node -e "const y=require('js-yaml'),f=require('fs');['backend-deploy','pretzel-console-deploy','mykka-web-deploy'].forEach(n=>y.load(f.readFileSync('.github/workflows/'+n+'.yml','utf8')))"`
Expected: no parse errors (fallback: any YAML parser available in the workspace; worst case rely on GitHub's parse on push).

```bash
git add .github/workflows/backend-deploy.yml .github/workflows/pretzel-console-deploy.yml .github/workflows/mykka-web-deploy.yml
git commit -m "ci: scope deploy workflows to GitHub environments with prefixed secrets"
```

---

### Task 9: Release + e2e workflows → environments + renamed secrets

**Files:**
- Modify: `.github/workflows/pretzel-release.yml`, `.github/workflows/pretzel-desktop-release.yml`, `.github/workflows/e2e.yml`

- [ ] **Step 1: pretzel-release.yml** (tag-triggered → always production)

Add under the job's `runs-on:`: `environment: production`. Replace:

```yaml
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.PRETZEL_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: ${{ secrets.PRETZEL_API_BASE }}
```

Discord → `SHARED_DISCORD_WEBHOOK_URL`.

- [ ] **Step 2: pretzel-desktop-release.yml**

Add `environment: production` to every job that references `MYKKA_API_URL_PROD` / `VITE_CLERK_PUBLISHABLE_KEY_PROD` (the three build/package jobs). In each of those jobs' build steps replace:

```yaml
          MYKKA_API_URL: ${{ secrets.PRETZEL_DESKTOP_API_URL }}
          CLERK_PUBLISHABLE_KEY: ${{ secrets.PRETZEL_CLERK_PUBLISHABLE_KEY }}
```

Discord → `SHARED_DISCORD_WEBHOOK_URL`.

- [ ] **Step 3: e2e.yml** (always staging)

Add under the e2e job's `runs-on:`: `environment: staging`. Replacements:

```yaml
      # Build extension + Build pretzel-console steps:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.PRETZEL_CLERK_PUBLISHABLE_KEY }}

      # Start backend (test DB) step:
          CLERK_SECRET_KEY: ${{ secrets.E2E_CLERK_SECRET_KEY }}
          CLERK_WEBHOOK_SECRET: ${{ secrets.E2E_CLERK_WEBHOOK_SECRET }}

      # Run E2E suite step:
          CLERK_SECRET_KEY: ${{ secrets.E2E_CLERK_SECRET_KEY }}
          CLERK_PUBLISHABLE_KEY: ${{ secrets.PRETZEL_CLERK_PUBLISHABLE_KEY }}
          # E2E_CLERK_USER_ID / ORG_ID / EMAIL / PASSWORD keep their secret names
          # (they move repo-level → staging environment; refs unchanged)
```

Everything hardcoded stays: postgres service, `E2E_DATABASE_URL`, `INTERNAL_SECRET` literals, `RATE_LIMIT_DISABLED`, URLs. Discord → `SHARED_DISCORD_WEBHOOK_URL`.

- [ ] **Step 4: Validate + commit**

Same YAML parse check as Task 8 for the three files.

```bash
git add .github/workflows/pretzel-release.yml .github/workflows/pretzel-desktop-release.yml .github/workflows/e2e.yml
git commit -m "ci: scope release and e2e workflows to environments with prefixed secrets"
```

---

### Task 10: Documentation

**Files:**
- Create: `docs/ENVIRONMENT_AND_SECRETS.md`
- Modify: `docs/index.md`

- [ ] **Step 1: Write `docs/ENVIRONMENT_AND_SECRETS.md`**

Content requirements (source of truth = spec sections 1-3; copy the tables, don't paraphrase them loosely):

1. **Naming convention** — `<APP>_<NAME>` GitHub secrets, `SHARED_` prefix, no env suffix (environment supplies it), secret name ≠ runtime var name with the mapping example.
2. **Rename map** — the three tables from the spec (environment-scoped, staging-only e2e, repo-level) verbatim.
3. **Two-axis taxonomy table** (deploy vs test) verbatim from spec.
4. **`.env` file matrix** per package (active file, loader, which files committed vs gitignored), including desktop's build-time baking note.
5. **Rotation procedure** — rotate in GitHub environment secret AND local `.env.prod` AND Render/Vercel dashboard; list which var lives where.
6. **Manual migration checklist** (numbered, from spec section 5): create environments → add new secrets → merge PR → verify green (e2e on PR, deploys on merge, one tagged release each when convenient) → delete old repo-level secrets. Include the note that `CONSOLE_RENDER_DEPLOY_HOOK` values must first be created in the Render dashboard (known open item), and that Yarin creates `pretzel-desktop/.env.prod` locally.

- [ ] **Step 2: Link from docs index**

In `docs/index.md`, under the Operations section (the one listing the release process page), add a line linking `ENVIRONMENT_AND_SECRETS.md` with the label "Environments & secrets".

- [ ] **Step 3: Docs check + commit**

Run: `node scripts/docs-check.mjs` — expected: pass (fix any link errors it reports).

```bash
git add docs/ENVIRONMENT_AND_SECRETS.md docs/index.md
git commit -m "docs: environment & secrets convention, rename map, migration checklist"
```

---

### Task 11: Final verification sweep

**Files:** none created — verification only.

- [ ] **Step 1: Grep gates (all expected empty)**

```bash
grep -rnE "process\.env(\.[A-Z_0-9]+|\[)" backend/src --include="*.ts" | grep -vE "src/env\.(ts|test\.ts)|db/client\.ts|db/migrate\.ts|db/seeds/|scripts/"
grep -rn "process\.env\.NEXT_PUBLIC" mykka-web/app mykka-web/lib mykka-web/components | grep -v "lib/env.ts"
grep -rn "import\.meta\.env" pretzel/src pretzel-console/src | grep -v "/env.ts"
grep -rn "process\.env\.\(MYKKA_API_URL\|CLERK_PUBLISHABLE_KEY\)" pretzel-desktop/electron | grep -v "electron/env.ts"
grep -rn "secrets\.\(PROD_DATABASE_URL\|STAGING_DATABASE_URL\|RENDER_BACKEND\|RENDER_CONSOLE\|VITE_CLERK_PUBLISHABLE_KEY\|VITE_API_BASE_PROD\|MYKKA_API_URL_PROD\|DISCORD_WEBHOOK_URL\|RENDER_API_KEY\b\|CLERK_SECRET_KEY\|CLERK_WEBHOOK_SECRET\)" .github/workflows
```

- [ ] **Step 2: Full test + build pass**

```bash
pnpm --filter pretzel-api test
pnpm --filter pretzel-extension test
pnpm --filter pretzel-console test && pnpm --filter pretzel-console typecheck
pnpm --filter pretzel-desktop test
pnpm --filter mykka-web build   # wraps type-check
node scripts/set-env.mjs staging
```

Expected: everything green; set-env lists backend, mykka-web, pretzel-desktop copies.

- [ ] **Step 3: Push branch + open PR**

```bash
git push -u origin chore/env-secrets-standardization
gh pr create --title "Env & secrets standardization: GitHub Environments, prefixed secrets, validated env modules" --body "$(cat <<'EOF'
Implements docs/superpowers/specs/2026-07-11-env-and-secrets-standardization-design.md

- GitHub secrets renamed to <APP>_<NAME> / SHARED_*, scoped via production/staging environments
- All 6 workflows use `environment:`; per-secret branch ternaries removed
- Standard .env trio per package; desktop gains .env files + build-time baking (fixes latent no-op CI env bug)
- zod-validated env.ts per package; no raw env reads outside allowlist
- docs/ENVIRONMENT_AND_SECRETS.md with manual migration checklist

⚠ MERGE ORDER: create environments + new secrets in GitHub UI first (checklist in docs) — deploy jobs fail loudly on missing secrets otherwise.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens; e2e workflow on the PR is the live test of Task 9's e2e changes (requires the staging environment secrets to exist).
