# Architecture Review — Marcus Webb, CTO
**Date:** 2026-06-08
**Scope:** 19 files across backend, pretzel, pretzel-console, mykka-web, e2e, scripts

---

#### `backend/src/app.ts` — Fastify application factory
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **CORS open by default.** When `CORS_ORIGIN` is not set, `origin: true` reflects every requesting origin, including attacker-controlled pages. In a pre-prod environment where someone forgot to set the env var, the API is fully open to CSRF from any website. This is a ticking clock — one misconfigured deploy and we have a real exposure on a credentialed API.
  2. **PayPal webhook has no signature verification.** The `/webhooks/paypal` route accepts any `Record<string, unknown>` body and passes it straight to `handlePayPalEvent`. The raw body is even already available (the custom content-type parser leaves it as a string for stripe; for PayPal it goes through `JSON.parse` first, so signature verification on the raw body is still feasible). An attacker can POST a fake `BILLING.SUBSCRIPTION.ACTIVATED` event and provision themselves a tenant for free.
  3. **Stripe webhook correctly uses `constructEvent`** — this is fine.
  4. **`void` on `app.register` calls.** Fastify plugin registration is async; swallowing the promise means startup errors during plugin registration are silently dropped. Should `await` each register call, or use `app.after()` / the encapsulation pattern.
  5. **Alignment whitespace inconsistency** on lines 65–70 — minor, cosmetic.
  **Proposed changes:**
  - Default CORS to `false` (closed), not `true`. Require `CORS_ORIGIN` to be set; throw at startup if missing in non-test environments.
  - Add PayPal webhook signature verification using `PAYPAL_WEBHOOK_ID` + the PayPal `/v1/notifications/verify-webhook-signature` API, mirroring how Stripe uses `constructEvent`.
  - Replace `void app.register(...)` with `await app.register(...)` or use a plugin-composition pattern so registration errors surface.

---

#### `backend/src/index.ts` — Server entrypoint / boot sequence
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Boot sequence is clean — DB ping before listen, graceful SIGTERM/SIGINT, `host: 0.0.0.0` correct for containers. `PORT` env var is bracketed consistently. No issues.
  **Proposed changes:** N/A

---

#### `backend/src/types.ts` — Fastify request augmentation
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `tokenPrefix` admits `'clerk'` as a value alongside the two internal token formats. This means auth middleware is expected to distinguish three different authentication paths via the same field. The value `'clerk'` is a leaky internal implementation detail — it means "the auth came from Clerk's JWT/session", which is a very different auth surface than the `ps_live` / `ps_adm` bearer tokens. Having a single discriminant field covering both token families and the Clerk SSO path makes auth middleware logic brittle: a new token type means touching every downstream `switch` on `tokenPrefix`. Additionally `user?` and `platformUser?` are both typed as `User` with no distinguishing comment — it is not obvious which middleware sets which and whether both can coexist on the same request.
  **Proposed changes:**
  - Split into two discriminated fields: `authKind: 'token' | 'clerk'` and `tokenPrefix?: 'ps_live' | 'ps_adm'` (only present when `authKind === 'token'`).
  - Add a JSDoc comment on `platformUser` vs `user` explaining the two middleware paths.

---

#### `backend/drizzle.config.ts` — Drizzle-Kit migration config
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `dbCredentials.url` uses a non-null assertion (`DATABASE_URL!`) with no fallback or startup check. If `DATABASE_URL` is undefined, drizzle-kit will crash with a confusing error rather than a clear message. This file is only used for migrations (not runtime), but it is still worth guarding. The `out: './drizzle'` path is implicit relative — fine locally, but ensure the CI migration step is always invoked from the `backend/` directory.
  **Proposed changes:**
  - Add a guard: `const url = process.env.DATABASE_URL; if (!url) throw new Error('DATABASE_URL must be set for drizzle-kit'); export default { ..., dbCredentials: { url } }`.

---

#### `pretzel/src/shared/constants.ts` — Extension shared constants
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`promptshield_` prefixes on storage keys.** The comments explain the legacy reason (preserve existing users' data on upgrade from "PromptShield"), but these keys are a permanent architectural scar. Any future schema migration must account for the mismatch between the product name ("mykka" / "pretzel") and the storage namespace. There is no migration path documented, no version flag, and `AUDIT_DB_VERSION = 1` is hardcoded — if the IndexedDB schema ever changes, there is no upgrade handler referenced here.
  2. **`EXTENSION_VERSION = "2.0.0"` duplicated** between this file and `manifest.config.ts`. Two sources of truth for the same value; they will drift.
  3. **`AUDIT_DB_VERSION` is a magic number** with no enum or comment explaining what version 1 means schema-wise.
  **Proposed changes:**
  - Extract version to a single canonical location (e.g., read from `manifest.config.ts` or a shared `version.ts`) imported by both.
  - Document the IndexedDB schema for version 1 in a comment beside `AUDIT_DB_VERSION`.
  - Create a `STORAGE_SCHEMA_VERSION` key so the extension can detect and migrate old `promptshield_` data in a future release.

---

#### `pretzel/src/shared/messages.ts` — Extension typed message bus
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`sendMessage<T>` is untyped at the call site.** The generic `T` for the response is entirely caller-provided with no constraint to the actual response shape for each message type. A caller doing `sendMessage<string>({ type: 'GET_POLICY' })` gets a `Promise<string>` that will blow up at runtime when a `Policy` object comes back. The discriminated union for `Message` covers the request side but nothing enforces the response type.
  2. **No response type map.** There is no companion type like `MessageResponse<M extends Message>` that maps each message type to its response payload. This is a design gap that will cause subtle runtime bugs as the codebase grows.
  3. **`onMessage` callback return type is `boolean | void`** — callers returning `true` signal async response. This is correct Chrome API usage, but the abstraction hides it, making it easy for new contributors to forget to return `true` when they call `sendResponse` asynchronously.
  **Proposed changes:**
  - Add a `MessageResponseMap` type keyed by `Message['type']` mapping each message type to its response shape, and constrain `sendMessage` to `sendMessage<M extends Message>(message: M): Promise<MessageResponseMap[M['type']]>`.
  - Add a JSDoc note on `onMessage` about the `return true` requirement for async responses.

---

#### `pretzel/manifest.config.ts` — Chrome extension manifest
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`version: "2.0.0"` hardcoded** — duplicates the version in `constants.ts`. Will drift. Should be derived from `package.json` version at build time (crxjs supports this via `defineManifest` with a version import or a build plugin).
  2. **`http://localhost:9876/*` is in `LLM_HOSTS` and therefore in `host_permissions` and `content_scripts.matches`.** This localhost entry will be present in production builds unless there is a build-mode guard. Users' production extensions will declare a `localhost` host permission they never use, which is a minor security surface and will look suspicious in Chrome Web Store review.
  3. **No `Perms` / permissions audit comment.** `scripting` + `activeTab` + `storage` + `alarms` — these are all reasonable, but there is no record of *why* `scripting` is needed (likely for injecting content into pages not in `content_scripts`). As the extension matures, unused permissions raise rejection risk on the store.
  **Proposed changes:**
  - Remove `localhost:9876` from `LLM_HOSTS` for production builds; use Vite's `mode` to conditionally include it only in `development`/`test` modes.
  - Import `version` from `../package.json` (with `"resolveJsonModule": true`) so there is one source of truth.

---

#### `pretzel/vite.config.ts` — Pretzel extension Vite config
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`test.environment: "node"`** for an extension that runs entirely in a browser context. Unit tests for detection logic, policy parsing, and content-script utilities should run in `jsdom` (or `happy-dom`) to catch DOM-dependent bugs. Node environment silently passes tests that would fail in the actual browser runtime.
  2. **`define: { global: 'globalThis' }`** — this shim is needed for some Node-oriented npm packages. No comment explaining which dependency requires it. When that dependency is removed or updated, this dead config will stay forever. Worth a comment.
  3. **`build.rollupOptions.input`** manually lists popup and options HTML but relies on crxjs for the service worker and content script. This is the correct split, but it is fragile — if a new entry point (e.g., a side panel) is added, it is easy to forget to add it here.
  **Proposed changes:**
  - Switch `test.environment` to `'jsdom'` (add `@vitest/browser` or `jsdom` if not already installed).
  - Add an inline comment on the `global` shim naming the dep it patches.

---

#### `pretzel-console/vite.config.ts` — Admin SPA Vite config
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Minimal and correct. `jsdom` environment for the console tests is the right call. No path aliases configured — may become a pain point as the SPA grows, but not an issue yet. No issues.
  **Proposed changes:** N/A

---

#### `pretzel-console/src/types.ts` — Admin SPA shared types
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Diverged from backend schema — no single source of truth.** These types are hand-maintained TypeScript interfaces that mirror the backend's Drizzle schema and API response shapes. There is no code generation, no shared package, and no contract test enforcing alignment. `Rule.kind` here includes `'entropy' | 'score'`, `Rule.destinations` is `string[]`, `Rule.destinationGroupIds` is `string[]`. If the backend adds or renames a field, this file silently drifts and the admin console starts misreading API responses.
  2. **`PolicyInfo.policy: unknown`** is untyped. The console presumably renders or inspects this field, but the type gives zero guidance. The pretzel extension has a `Policy` schema in `src/policy/schema.ts` — that schema should be the canonical type, shared or re-exported.
  3. **`AssistantChatResponse.actions: unknown[]` and `AssistantApplyResponse.applied: unknown[]`** — same problem. The assistant "actions" are a defined grammar (they're the AI-generated config changes), but the type says nothing. If the action shape changes, there is no TypeScript signal anywhere.
  4. **`ChatMessage.actionsJson: unknown[] | null`** — again untyped. Three separate `unknown[]` for the same action concept in three different interfaces.
  **Proposed changes:**
  - Create a shared `packages/shared-types` workspace package that exports all API response types, generated from or co-located with the backend Drizzle schema. Both `pretzel-console` and (where needed) `pretzel` import from it.
  - At minimum, define an `Action` type (even as a tagged union draft) and replace all `unknown[]` references.
  - Replace `PolicyInfo.policy: unknown` with the canonical `Policy` type from the pretzel schema or a shared package.

---

#### `pretzel/src/types/global.d.ts` — Extension global type declarations
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean and minimal. `/// <reference types="chrome" />` is correct for MV3 TypeScript. The `ImportMetaEnv` interface properly marks `VITE_API_BASE` and `VITE_SENTRY_DSN_EXTENSION` as `string | undefined` (optional) while `VITE_CLERK_PUBLISHABLE_KEY` is required — this is the right posture. The CSS module declaration for `?inline` suffix is correct. No issues.
  **Proposed changes:** N/A

---

#### `e2e/playwright.config.ts` — Root cross-cutting E2E config
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Only one of four advertised projects is actually defined.** The root `CLAUDE.md` documents four projects: `api`, `extension`, `cross-service`, `admin`. This config file defines only `cross-service`. There are no `api`, `extension`, or `admin` project entries. The CLAUDE.md instructions `npx playwright test --project=api` and `--project=admin` will silently find no tests and exit 0, giving a false green. This is a significant regression risk — anyone following the documented workflow is not running the tests they think they are.
  2. **`headless: false` with `--headless=new` in args.** The `use.headless: false` tells Playwright not to add `--headless`, but then `launchOptions.args` manually adds `--headless=new`. This works but is confusing — the double-definition is error-prone if either side changes. The canonical way for Playwright + Chromium extensions is `headless: false` + `--headless=new` arg (because Playwright's `headless: true` uses `--headless=old` which breaks extensions), but it should have a comment explaining this is intentional.
  3. **`workers: 1` is global.** For a multi-project suite that grows to cover API (parallelisable), extension (must be serial), and admin (parallelisable), this will be slow. Should be set per-project.
  4. **`reuseExistingServer: true`** on the fixture server means a stale server from a previous run can silently serve old fixture content to the new test run. Safe in CI (fresh environment) but dangerous locally.
  **Proposed changes:**
  - Add the missing `api` and `admin` project definitions, pointing to their respective spec directories, or update CLAUDE.md to reflect that those projects live in per-package configs only.
  - Add a comment explaining the `headless: false` + `--headless=new` combination.
  - Set `workers` per project rather than globally.

---

#### `e2e/global-setup.ts` — E2E global setup / DB seeding
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`execSync` for DB seeding blocks the event loop** and swallows the exit code on error (it throws, which is caught by Playwright's setup runner). This is acceptable, but `execSync` with `stdio: 'inherit'` means seed output is interleaved with Playwright's own output in CI logs. Using `spawnSync` with a timeout guard would be cleaner.
  2. **E2E env vars are non-null asserted (`!`) but only `E2E_DATABASE_URL` is validated at startup.** If `E2E_CLERK_ORG_ID`, `E2E_CLERK_USER_ID`, or `E2E_CLERK_USER_EMAIL` are unset, the seed script will receive empty strings and likely fail with a confusing downstream error rather than a clear "missing env var" message here.
  3. **`.auth` directory is created unconditionally** even if no test uses Clerk browser auth storage in this config. Harmless but dead.
  **Proposed changes:**
  - Add explicit presence checks for all three Clerk env vars before calling `execSync`, with a single error listing all missing vars.
  - Consider adding a `timeout` option to `execSync` so a hung seed script does not block CI indefinitely.

---

#### `e2e/global-teardown.ts` — E2E global teardown
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Teardown is not guarded against partial setup failure.** If `global-setup.ts` fails midway (e.g., seed errors after `mkdirSync` but before full seed), `global-teardown.ts` still runs and calls `pnpm run teardown:e2e`. If the seed never completed, the teardown may drop a half-seeded DB or fail silently. For a test DB this is acceptable, but it can leave the DB in an inconsistent state for the next local run.
  2. **`E2E_DATABASE_URL` non-null assertion** without a guard — same issue as global-setup.
  3. **No error handling on `execSync`** — if teardown fails (e.g., network blip), Playwright will report a teardown error but the test run will still be marked as completed. A failed teardown should be loud.
  **Proposed changes:**
  - Validate `E2E_DATABASE_URL` at the top.
  - Wrap `execSync` in a try/catch that re-throws with a clear message, or use `spawnSync` and check `status !== 0`.

---

#### `mykka-web/next.config.ts` — Marketing site Next.js config
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`output: 'standalone'`** is correct for containerised deployments. However, the config is entirely empty beyond this one option. There are no `images.domains` / `images.remotePatterns`, no `headers()` for security headers (CSP, HSTS, X-Frame-Options), no `redirects()`. For a marketing site, missing security headers is a real gap — especially given this is a DLP/security product; customers will run security audits against it.
  2. **No `env` validation.** If `NEXT_PUBLIC_*` vars are not set at build time, Next.js bakes in `undefined` silently. A startup check or `@t3-oss/env-nextjs` schema would prevent broken production deployments.
  3. The `AGENTS.md` (referenced from `CLAUDE.md`) warns that this Next.js version has breaking changes from training data. This is fine as a contributor note, but means the config should be audited against the actual installed Next.js version's docs — cannot assume `output: 'standalone'` behaves identically to what is documented in common references.
  **Proposed changes:**
  - Add a `headers()` export with at minimum `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a basic `Content-Security-Policy`.
  - Add `images.remotePatterns` if any remote images are used.

---

#### `scripts/set-env.mjs` — Environment file switcher
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **File-copying env management is fragile.** This script copies `.env.staging` → `.env` and `.env.prod` → `.env.local`, which means the source env files must exist in each package directory and be kept out of git. If a developer runs `pnpm dev` without running this script first, they silently get whatever `.env` was last copied. There is no check for which environment is currently active.
  2. **`pretzel` and `pretzel-console` are excluded from the copy** (they use `--mode` at build time), but there is no validation that the Vite `--mode` files exist.
  3. **No atomic operation.** If the script is interrupted mid-copy (e.g., two packages copied, the third not), the repo is in a mixed-environment state with no indication.
  4. **`process.argv[2]` only — no `--help` flag, no validation of extra args.**
  **Proposed changes:**
  - This is acceptable for a small team pre-launch, but the long-term fix is to use a secrets manager or per-deploy env injection (e.g., SSM Parameter Store / Doppler) rather than copying files. Document this as tech debt.
  - At minimum, add a `.env.current` file (gitignored) that records the last set environment so developers know what state they are in.

---

#### `e2e/helpers/admin-headers.ts` — Admin auth header helper
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Thin, correct wrapper. Reads from `getSeedState()` which caches the JSON file. No issues.
  **Proposed changes:** N/A

---

#### `e2e/helpers/org-headers.ts` — Org auth header helper
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Same pattern as `admin-headers.ts`. Clean. No issues.
  **Proposed changes:** N/A

---

#### `e2e/helpers/seed-state.ts` — Seed state reader
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`readFileSync` on `.seed-state.json` with no error handling.** If the file does not exist (e.g., developer forgot to run `pnpm seed:e2e`), the error thrown is `ENOENT: no such file or directory` which is not actionable. Should catch and re-throw with `"Run 'pnpm seed:e2e' in backend/ first"`.
  2. **`JSON.parse(...) as SeedState` — no runtime validation.** If the seed script changes the shape of `.seed-state.json` (e.g., adds a field, renames `orgToken` to `memberToken`), every test that calls `getSeedState()` fails with a confusing `undefined` access rather than a clear schema mismatch.
  3. **Module-level `_cache`** is a singleton. In multi-worker Playwright runs, each worker has its own module context so this is fine — but if workers is ever increased to >1, the file is read once per worker, which is fine. No issue there.
  4. **`__dirname` usage in a file that may be compiled to ESM.** If the package's `tsconfig` targets `"module": "ESNext"` or `"NodeNext"`, `__dirname` is not available. Should use `new URL('.', import.meta.url).pathname` instead.
  **Proposed changes:**
  - Wrap `readFileSync` + `JSON.parse` in a try/catch with a human-readable error message.
  - Replace `__dirname` with `fileURLToPath(new URL('.', import.meta.url))` for ESM compatibility.
  - Consider adding a runtime shape check (even a simple key presence check) before returning the cast.

---

## Summary Table

| File | Verdict |
|---|---|
| `backend/src/app.ts` | WARN |
| `backend/src/index.ts` | PASS |
| `backend/src/types.ts` | WARN |
| `backend/drizzle.config.ts` | WARN |
| `pretzel/src/shared/constants.ts` | WARN |
| `pretzel/src/shared/messages.ts` | WARN |
| `pretzel/manifest.config.ts` | WARN |
| `pretzel/vite.config.ts` | WARN |
| `pretzel-console/vite.config.ts` | PASS |
| `pretzel-console/src/types.ts` | ISSUE |
| `pretzel/src/types/global.d.ts` | PASS |
| `e2e/playwright.config.ts` | ISSUE |
| `e2e/global-setup.ts` | WARN |
| `e2e/global-teardown.ts` | WARN |
| `mykka-web/next.config.ts` | WARN |
| `scripts/set-env.mjs` | WARN |
| `e2e/helpers/admin-headers.ts` | PASS |
| `e2e/helpers/org-headers.ts` | PASS |
| `e2e/helpers/seed-state.ts` | WARN |

**PASS: 5 | WARN: 12 | ISSUE: 2**

---

## Top Issues to Address

### 1. ISSUE — `e2e/playwright.config.ts`: Missing `api` and `admin` test projects
The root CLAUDE.md advertises four test projects; only `cross-service` exists. `--project=api` and `--project=admin` silently exit 0. The cross-cutting regression gate is broken by omission. Fix: add the missing project definitions or correct the documentation to point developers to the per-package `pnpm test:e2e` commands.

### 2. ISSUE — `pretzel-console/src/types.ts`: No single source of truth for API contracts
Hand-maintained interfaces that mirror the backend schema will drift. Three separate `unknown[]` for the "actions" concept provide zero type safety on the most complex feature (the AI assistant). This is the highest ongoing maintenance risk in the codebase. Fix: shared-types workspace package, generated or manually co-located with the backend schema.

### 3. WARN (security) — `backend/src/app.ts`: PayPal webhook has no signature verification
Anyone can POST a crafted `BILLING.SUBSCRIPTION.ACTIVATED` event and get a free tenant created. Stripe is correctly verified. PayPal is not. Fix: implement PayPal webhook signature verification before launch.

### 4. WARN (security) — `backend/src/app.ts`: CORS defaults to `true` (wildcard)
A missing `CORS_ORIGIN` env var opens the credentialed API to all origins. For a security product this is embarrassing. Fix: default to `false` or a safe explicit allowlist; throw at startup in non-test environments if the var is absent.

### 5. WARN — `pretzel/manifest.config.ts` + `pretzel/src/shared/constants.ts`: `localhost:9876` in production host_permissions and duplicate version strings
The localhost E2E fixture host ships in production builds, and the version number lives in two places. Both are pre-launch fixable with a mode guard and a single version import from `package.json`.
