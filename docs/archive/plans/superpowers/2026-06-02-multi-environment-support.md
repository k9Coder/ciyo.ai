# Multi-Environment Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add staging and production environment support across all four packages so that developers/testers run against staging (separate DB + Clerk dev instance) and customers run against production, switchable via `pnpm set-env:staging` or `pnpm set-env:prod` at the monorepo root.

**Architecture:**
- A single root script copies the right `.env.<env>` file to `.env` for the backend (which uses `--env-file=.env`) and to `.env.local` for ciyo-web (Next.js convention). Vite packages (pretzel, pretzel-console) use Vite's built-in `--mode` flag to load `.env.<env>` directly — no copy needed, just dedicated `dev:staging`, `build:staging` etc. npm scripts.
- **Clerk:** Staging maps to the existing Clerk *development* instance (`pk_test_`/`sk_test_`), production to the Clerk *production* instance (`pk_live_`/`sk_live_`). Same Clerk app, two environments, both within the free tier — no second account needed.
- **Database:** A separate Postgres database (`promptshield_staging`) is created locally and on whatever hosted DB you use. Same schema, same migrations — just different data. Running `pnpm db:migrate` in backend applies migrations to whichever DB is in the current `.env`.
- **Extension (pretzel):** Env vars are baked in at Vite build time. `pnpm build:staging` in `pretzel/` produces a `dist/` with staging API base + staging Clerk key. Testers load this `dist/` as an unpacked Chrome extension for staging testing.

**Tech Stack:** pnpm workspaces, Node.js scripts (ESM), Vite `--mode`, Next.js `.env.local`, Drizzle migrations, Clerk development/production instances.

---

## Environment File Strategy

| Package | How env is loaded | Staging file | Prod file | Notes |
|---|---|---|---|---|
| `backend/` | `--env-file=.env` | `.env.staging` → copied to `.env` | `.env.prod` → copied to `.env` | Script does the copy |
| `pretzel/` | Vite `import.meta.env` | `.env.staging` (loaded via `--mode staging`) | `.env.prod` (loaded via `--mode prod`) | No copy needed |
| `pretzel-console/` | Vite `import.meta.env` | `.env.staging` (loaded via `--mode staging`) | `.env.prod` (loaded via `--mode prod`) | No copy needed |
| `ciyo-web/` | Next.js env loading | `.env.staging` → copied to `.env.local` | `.env.prod` → copied to `.env.local` | Script does the copy |

## Clerk Instance Mapping

| Environment | Clerk instance type | Key prefix | Where to get keys |
|---|---|---|---|
| staging | development | `pk_test_` / `sk_test_` | Clerk dashboard → your app → Development instance |
| prod | production | `pk_live_` / `sk_live_` | Clerk dashboard → your app → Production instance |

You likely already have both. Current `backend/.env` uses `sk_test_` = this is staging keys. Production keys come when you "go live" in Clerk.

## Extension Staging Testing Flow

Since the extension bakes `VITE_API_BASE` and `VITE_CLERK_PUBLISHABLE_KEY` at build time:

1. `pnpm set-env:staging` (sets backend's `.env`, used for other packages too)
2. `cd pretzel && pnpm build:staging` → produces `dist/` pointing to staging API
3. Chrome → `chrome://extensions` → "Developer mode" on → "Load unpacked" → select `pretzel/dist/`
4. Sign in with a staging Clerk account (created in Clerk's development instance)
5. Backend must be running: `cd backend && pnpm dev` (reads its `.env` which was set to staging)

> **Note on Extension ID:** When loading an unpacked extension, Chrome generates a random ID unless a `key` field is in the manifest. Clerk's allowed origins for the extension should be configured to allow `chrome-extension://*` in the development instance (it's permissive by default there). For production, the extension's fixed Chrome Web Store ID must be registered in Clerk's production instance.

---

## File Map

**Create:**
- `scripts/set-env.mjs` — root env switcher
- `backend/.env.staging` — staging DB + test Clerk keys
- `backend/.env.prod` — production DB + live Clerk keys (gitignored, secrets)
- `pretzel/.env.staging` — staging API base + test Clerk publishable key
- `pretzel/.env.prod` — prod API base + live Clerk publishable key
- `pretzel/.env.example` — documents required VITE_ vars
- `pretzel-console/.env.staging` — staging API base + test Clerk publishable key
- `pretzel-console/.env.prod` — prod API base + live Clerk publishable key
- `ciyo-web/.env.staging` — staging public vars
- `ciyo-web/.env.prod` — prod public vars

**Modify:**
- `package.json` (root) — add `set-env:staging`, `set-env:prod` scripts
- `pretzel/package.json` — add `build:staging`, `build:prod`, `dev:staging` scripts
- `pretzel-console/package.json` — add `dev:staging`, `dev:prod`, `build:staging`, `build:prod`
- `.gitignore` (root) — gitignore `*.prod` env files, do NOT gitignore `*.staging` (they use test keys safe to commit)
- Each package's `.gitignore` — same rule

---

## Task 1: Root env-switcher script

**Files:**
- Create: `scripts/set-env.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: Read the current root package.json to see its scripts section**

```bash
cat package.json
```

- [ ] **Step 2: Create `scripts/set-env.mjs`**

```js
// scripts/set-env.mjs
import { copyFileSync, existsSync } from "fs";
import { join } from "path";

const env = process.argv[2];
if (!env || !["staging", "prod"].includes(env)) {
  console.error("Usage: node scripts/set-env.mjs <staging|prod>");
  process.exit(1);
}

// backend and ciyo-web need a file copy; Vite packages use --mode at build time
const copies = [
  { pkg: "backend", src: `.env.${env}`, dest: ".env" },
  { pkg: "ciyo-web", src: `.env.${env}`, dest: ".env.local" },
];

for (const { pkg, src, dest } of copies) {
  const srcPath = join(pkg, src);
  const destPath = join(pkg, dest);
  if (!existsSync(srcPath)) {
    console.warn(`⚠  ${srcPath} not found — skipped`);
    continue;
  }
  copyFileSync(srcPath, destPath);
  console.log(`✓  ${pkg}/${dest}  ←  ${src}`);
}

console.log(`\nEnvironment set to: ${env}`);
console.log("Vite packages (pretzel, pretzel-console) use --mode at build time.");
console.log(`  pretzel:         pnpm build:${env}  or  pnpm dev:${env}`);
console.log(`  pretzel-console: pnpm dev:${env}    or  pnpm build:${env}`);
```

- [ ] **Step 3: Add scripts to root `package.json`**

Open `package.json`. In the `"scripts"` section, add:

```json
"set-env:staging": "node scripts/set-env.mjs staging",
"set-env:prod": "node scripts/set-env.mjs prod"
```

If there's no `scripts` section yet, add one. If the root `package.json` doesn't exist (deleted per git status), create a minimal one:

```json
{
  "private": true,
  "scripts": {
    "set-env:staging": "node scripts/set-env.mjs staging",
    "set-env:prod": "node scripts/set-env.mjs prod"
  }
}
```

- [ ] **Step 4: Test the script produces helpful output even before env files exist**

```bash
node scripts/set-env.mjs staging
```

Expected output (with warnings since files don't exist yet):
```
⚠  backend/.env.staging not found — skipped
⚠  ciyo-web/.env.staging not found — skipped

Environment set to: staging
Vite packages (pretzel, pretzel-console) use --mode at build time.
  pretzel:         pnpm build:staging  or  pnpm dev:staging
  pretzel-console: pnpm dev:staging    or  pnpm build:staging
```

- [ ] **Step 5: Commit**

```bash
git add scripts/set-env.mjs package.json
git commit -m "feat(env): add set-env switcher script for staging/prod"
```

---

## Task 2: Backend environment files

**Files:**
- Create: `backend/.env.staging`
- Create: `backend/.env.prod`
- Modify: `backend/.env.example`

- [ ] **Step 1: Create `backend/.env.staging`**

This uses the Clerk **development** instance keys (same as current `.env`). DB is a separate local database (`promptshield_staging`).

```dotenv
# backend/.env.staging
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield_staging
CLERK_SECRET_KEY=sk_test_FILL_IN_FROM_CLERK_DEV_INSTANCE
CLERK_WEBHOOK_SECRET=whsec_FILL_IN_FROM_CLERK_DEV_INSTANCE
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
PAYPAL_SKIP_SIG_VERIFY=true
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=test
SMTP_PASS=test
SMTP_FROM=noreply@promptshield.dev
PORT=3000
LLM_PROVIDER=groq
GROQ_API_KEY=FILL_IN
ANTHROPIC_API_KEY=FILL_IN
OPENAI_API_KEY=FILL_IN
```

Then fill in the real `sk_test_` values by copying them from the current `backend/.env`.

- [ ] **Step 2: Create `backend/.env.prod`**

```dotenv
# backend/.env.prod
# PRODUCTION — never commit real values; fill in from your secrets manager / Railway / etc.
DATABASE_URL=postgresql://PROD_USER:PROD_PASS@PROD_HOST:5432/promptshield
CLERK_SECRET_KEY=sk_live_FILL_IN_FROM_CLERK_PROD_INSTANCE
CLERK_WEBHOOK_SECRET=whsec_FILL_IN_FROM_CLERK_PROD_INSTANCE
STRIPE_SECRET_KEY=sk_live_FILL_IN
STRIPE_WEBHOOK_SECRET=whsec_FILL_IN
PAYPAL_SKIP_SIG_VERIFY=false
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=FILL_IN
SMTP_PASS=FILL_IN
SMTP_FROM=noreply@promptshield.dev
PORT=3000
LLM_PROVIDER=groq
GROQ_API_KEY=FILL_IN
ANTHROPIC_API_KEY=FILL_IN
OPENAI_API_KEY=FILL_IN
```

- [ ] **Step 3: Update `backend/.env.example`**

Add a comment at the top explaining the env file pattern:

```dotenv
# Copy .env.staging or .env.prod to .env using: pnpm set-env:staging | pnpm set-env:prod
# Or fill this example directly for local dev.

DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYPAL_SKIP_SIG_VERIFY=false
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@promptshield.dev
PORT=3000
LLM_PROVIDER=groq
GROQ_API_KEY=...
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
```

- [ ] **Step 4: Create the staging database**

```bash
psql -U postgres -c "CREATE DATABASE promptshield_staging;"
```

Expected output: `CREATE DATABASE`

- [ ] **Step 5: Run migrations against staging DB to verify it works**

```bash
cd backend
# First set-env so .env points to staging
node ../scripts/set-env.mjs staging
pnpm db:migrate
```

Expected: migration output showing tables created in `promptshield_staging`. No errors.

- [ ] **Step 6: Commit env files (staging safe to commit, prod is a template)**

```bash
git add backend/.env.staging backend/.env.prod backend/.env.example
git commit -m "feat(env): add backend staging and prod env templates"
```

---

## Task 3: Backend .gitignore for env files

**Files:**
- Modify: `backend/.gitignore` (create if missing)

- [ ] **Step 1: Check if `backend/.gitignore` exists**

```bash
ls backend/.gitignore 2>/dev/null || echo "missing"
```

- [ ] **Step 2: Add env file rules**

In `backend/.gitignore`, ensure these lines exist:

```gitignore
# Environment files
.env
.env.prod
# .env.staging is safe to commit (uses test keys) — do not gitignore it
.env.test
```

`.env.prod` is gitignored because it will contain real production secrets. `.env.staging` is committed because it only uses Clerk test keys and local DB credentials.

- [ ] **Step 3: Verify `backend/.env.prod` is gitignored**

```bash
git check-ignore -v backend/.env.prod
```

Expected: `backend/.gitignore:X:.env.prod  backend/.env.prod`

- [ ] **Step 4: Verify `backend/.env.staging` is NOT gitignored**

```bash
git check-ignore -v backend/.env.staging
```

Expected: no output (not gitignored).

- [ ] **Step 5: Commit**

```bash
git add backend/.gitignore
git commit -m "chore(env): gitignore backend .env and .env.prod"
```

---

## Task 4: Pretzel (extension) environment files and build scripts

**Files:**
- Create: `pretzel/.env.staging`
- Create: `pretzel/.env.prod`
- Create: `pretzel/.env.example`
- Create: `pretzel/.gitignore` (or modify)
- Modify: `pretzel/package.json`

Vite loads `.env.<mode>` when `--mode <mode>` is passed. `pretzel/.env.staging` is loaded by `vite build --mode staging`. No file copy needed.

- [ ] **Step 1: Create `pretzel/.env.staging`**

```dotenv
# pretzel/.env.staging
# Loaded by: pnpm build:staging  or  pnpm dev:staging  (vite --mode staging)
VITE_API_BASE=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_FILL_IN_FROM_CLERK_DEV_INSTANCE
```

Fill in the real `pk_test_` value from the current `pretzel/.env`.

- [ ] **Step 2: Create `pretzel/.env.prod`**

```dotenv
# pretzel/.env.prod
# Loaded by: pnpm build:prod  (vite build --mode prod)
VITE_API_BASE=https://api.ciyo.ai
VITE_CLERK_PUBLISHABLE_KEY=pk_live_FILL_IN_FROM_CLERK_PROD_INSTANCE
```

- [ ] **Step 3: Create `pretzel/.env.example`**

```dotenv
# Copy .env.staging or .env.prod to .env for local vite dev (no --mode flag).
# Or pass --mode staging / --mode prod to vite directly.
VITE_API_BASE=http://localhost:3000
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```

- [ ] **Step 4: Add build and dev scripts to `pretzel/package.json`**

In the `"scripts"` section, add:

```json
"dev:staging": "vite --mode staging",
"dev:prod": "vite --mode prod",
"build:staging": "vite build --mode staging",
"build:prod": "vite build --mode prod"
```

Full updated scripts section:
```json
"scripts": {
  "dev": "vite",
  "dev:staging": "vite --mode staging",
  "dev:prod": "vite --mode prod",
  "build": "vite build",
  "build:staging": "vite build --mode staging",
  "build:prod": "vite build --mode prod",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src --ext .ts,.tsx",
  "test:e2e": "playwright test --config playwright.config.ts"
}
```

- [ ] **Step 5: Create/update `pretzel/.gitignore`**

```gitignore
dist/
dist-staging/
node_modules/
.env
.env.prod
# .env.staging is safe to commit
```

- [ ] **Step 6: Verify the staging build works**

```bash
cd pretzel
pnpm build:staging
```

Expected: build completes, `dist/` is produced. Open `dist/` and spot-check that `chrome-extension:` resources appear. No TypeScript errors.

- [ ] **Step 7: Verify the baked-in API base is correct for staging**

```bash
grep -r "localhost:3000" pretzel/dist/ --include="*.js" | head -5
```

Expected: matches found showing the staging API base was baked in.

- [ ] **Step 8: Commit**

```bash
git add pretzel/.env.staging pretzel/.env.prod pretzel/.env.example pretzel/.gitignore pretzel/package.json
git commit -m "feat(env): add pretzel staging/prod env files and build:staging/prod scripts"
```

---

## Task 5: Pretzel-console environment files and build scripts

**Files:**
- Create: `pretzel-console/.env.staging`
- Create: `pretzel-console/.env.prod`
- Modify: `pretzel-console/package.json`
- Modify: `pretzel-console/.gitignore` (create if missing)

Same Vite `--mode` approach as pretzel.

- [ ] **Step 1: Create `pretzel-console/.env.staging`**

```dotenv
# pretzel-console/.env.staging
# Loaded by: pnpm dev:staging or pnpm build:staging (vite --mode staging)
VITE_CLERK_PUBLISHABLE_KEY=pk_test_FILL_IN_FROM_CLERK_DEV_INSTANCE
VITE_API_BASE=http://localhost:3000
```

Fill in the real `pk_test_` value from the current `pretzel-console/.env`.

- [ ] **Step 2: Create `pretzel-console/.env.prod`**

```dotenv
# pretzel-console/.env.prod
# Loaded by: pnpm build:prod (vite build --mode prod)
VITE_CLERK_PUBLISHABLE_KEY=pk_live_FILL_IN_FROM_CLERK_PROD_INSTANCE
VITE_API_BASE=https://api.ciyo.ai
```

- [ ] **Step 3: Add scripts to `pretzel-console/package.json`**

In the `"scripts"` section, add:

```json
"dev:staging": "vite --mode staging",
"dev:prod": "vite --mode prod",
"build:staging": "vite build --mode staging",
"build:prod": "vite build --mode prod"
```

Full updated scripts section:
```json
"scripts": {
  "dev": "vite",
  "dev:staging": "vite --mode staging",
  "dev:prod": "vite --mode prod",
  "build": "vite build",
  "build:staging": "vite build --mode staging",
  "build:prod": "vite build --mode prod",
  "preview": "vite preview",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "test:e2e": "playwright test --config playwright.config.ts"
}
```

- [ ] **Step 4: Create/update `pretzel-console/.gitignore`**

```gitignore
dist/
node_modules/
.env
.env.prod
# .env.staging is safe to commit
```

- [ ] **Step 5: Verify dev:staging starts without errors**

```bash
cd pretzel-console
pnpm dev:staging
```

Expected: Vite starts on `localhost:5173` (or similar), no "env var not found" errors. Ctrl+C to stop.

- [ ] **Step 6: Commit**

```bash
git add pretzel-console/.env.staging pretzel-console/.env.prod pretzel-console/package.json pretzel-console/.gitignore
git commit -m "feat(env): add pretzel-console staging/prod env files and dev/build scripts"
```

---

## Task 6: ciyo-web environment files

**Files:**
- Create: `ciyo-web/.env.staging`
- Create: `ciyo-web/.env.prod`
- Modify: `ciyo-web/.gitignore` (create if missing)

Next.js loads `.env.local` at the highest priority in all modes. The `set-env` script copies `.env.<env>` to `.env.local`.

- [ ] **Step 1: Check current `ciyo-web` for any public env vars used**

```bash
grep -r "NEXT_PUBLIC_" ciyo-web/src --include="*.ts" --include="*.tsx" -l 2>/dev/null || echo "none found"
```

If none found, the site currently has no env vars. The files below will be minimal stubs.

- [ ] **Step 2: Create `ciyo-web/.env.staging`**

```dotenv
# ciyo-web/.env.staging
# Copied to .env.local by: pnpm set-env:staging
NEXT_PUBLIC_API_BASE=http://localhost:3000
NEXT_PUBLIC_ENV=staging
```

- [ ] **Step 3: Create `ciyo-web/.env.prod`**

```dotenv
# ciyo-web/.env.prod
# Copied to .env.local by: pnpm set-env:prod
NEXT_PUBLIC_API_BASE=https://api.ciyo.ai
NEXT_PUBLIC_ENV=production
```

- [ ] **Step 4: Create/update `ciyo-web/.gitignore`**

```gitignore
.next/
node_modules/
.env.local
.env.prod
# .env.staging is safe to commit
```

Note: `.env.local` is gitignored because it's generated by `set-env`. `.env.prod` is gitignored because it may contain secrets.

- [ ] **Step 5: Verify set-env copies correctly**

From the monorepo root:
```bash
node scripts/set-env.mjs staging
cat ciyo-web/.env.local
```

Expected:
```
NEXT_PUBLIC_API_BASE=http://localhost:3000
NEXT_PUBLIC_ENV=staging
```

- [ ] **Step 6: Commit**

```bash
git add ciyo-web/.env.staging ciyo-web/.env.prod ciyo-web/.gitignore
git commit -m "feat(env): add ciyo-web staging/prod env files"
```

---

## Task 7: Root .gitignore and end-to-end verification

**Files:**
- Modify: `.gitignore` (root)

- [ ] **Step 1: Check current root `.gitignore`**

```bash
cat .gitignore 2>/dev/null || echo "no root gitignore"
```

- [ ] **Step 2: Add rules for prod env files**

Add to root `.gitignore` (create if missing):

```gitignore
# Prod env files — contain real secrets
**/.env.prod
# Generated .env files (produced by set-env script)
ciyo-web/.env.local
# Staging files are safe to commit (test keys only)
# backend/.env.staging — committed
# pretzel/.env.staging — committed
# pretzel-console/.env.staging — committed
```

Using `**/.env.prod` catches all packages at once.

- [ ] **Step 3: Verify all .env.prod files are gitignored**

```bash
git check-ignore -v backend/.env.prod pretzel/.env.prod pretzel-console/.env.prod ciyo-web/.env.prod
```

Expected: each file listed with its gitignore rule.

- [ ] **Step 4: Verify staging files are NOT gitignored**

```bash
git check-ignore -v backend/.env.staging pretzel/.env.staging pretzel-console/.env.staging ciyo-web/.env.staging
```

Expected: no output (none are gitignored).

- [ ] **Step 5: Full flow test — staging**

```bash
# From monorepo root:
node scripts/set-env.mjs staging

# Backend: confirm .env now points to staging DB
grep DATABASE_URL backend/.env
# Expected: ...promptshield_staging

# pretzel — confirm staging build picks up localhost:3000
cd pretzel && pnpm build:staging && grep -r "localhost:3000" dist/ --include="*.js" | head -3
# Expected: matches found

# pretzel-console — confirm staging dev starts
cd ../pretzel-console && pnpm dev:staging &
sleep 5 && kill %1
# Expected: Vite started without errors

# ciyo-web — confirm .env.local was written
cat ciyo-web/.env.local | grep NEXT_PUBLIC_ENV
# Expected: NEXT_PUBLIC_ENV=staging
```

- [ ] **Step 6: Full flow test — prod**

```bash
# From monorepo root:
node scripts/set-env.mjs prod

grep DATABASE_URL backend/.env
# Expected: production DB URL

grep VITE_API_BASE pretzel-console/.env   # this file isn't written — Vite uses --mode
# Instead verify:
cd pretzel && pnpm build:prod
grep -r "api.ciyo.ai" dist/ --include="*.js" | head -3
# Expected: matches found
```

- [ ] **Step 7: Commit**

```bash
git add .gitignore
git commit -m "chore(env): gitignore all .env.prod files at root"
```

---

## How to Use — Quick Reference

### Switching to staging (developers / testers)

```bash
# From monorepo root:
pnpm set-env:staging

# Run backend:
cd backend && pnpm dev

# Run admin console:
cd pretzel-console && pnpm dev:staging

# Build extension for staging testing:
cd pretzel && pnpm build:staging
# Then: Chrome → chrome://extensions → Load unpacked → select pretzel/dist/

# Run marketing site:
cd ciyo-web && pnpm dev   # reads .env.local which was set to staging
```

### Switching to production (deploy)

```bash
pnpm set-env:prod

# Backend deploy:
cd backend && pnpm build && pnpm start

# Admin console build:
cd pretzel-console && pnpm build:prod

# Extension release build:
cd pretzel && pnpm build:prod
# Then: zip dist/ and submit to Chrome Web Store

# Marketing site:
cd ciyo-web && pnpm build && pnpm start
```

### Creating the staging DB (one-time)

```bash
psql -U postgres -c "CREATE DATABASE promptshield_staging;"
pnpm set-env:staging
cd backend && pnpm db:migrate
```

---

## Clerk Setup Checklist (one-time, manual)

These steps are done once in the Clerk dashboard, not automated.

- [ ] In Clerk dashboard → your app → **Development instance**: note `pk_test_` and `sk_test_` keys → paste into `backend/.env.staging`, `pretzel/.env.staging`, `pretzel-console/.env.staging`
- [ ] In Clerk dashboard → your app → **Production instance**: note `pk_live_` and `sk_live_` keys → paste into `backend/.env.prod`, `pretzel/.env.prod`, `pretzel-console/.env.prod`
- [ ] In Clerk dashboard → Development instance → **Allowed origins**: ensure `chrome-extension://*` is allowed (for unpacked extension staging testing)
- [ ] In Clerk dashboard → Production instance → **Allowed origins**: add the published extension's Chrome ID (e.g., `chrome-extension://abcdefghijklmnopqrstuvwxyz123456`) once it's in the Web Store

---

## Self-Review Checklist

- [x] `set-env` script handles missing files gracefully (warns, continues)
- [x] Vite packages use `--mode` flag — no file copy race conditions
- [x] `.env.prod` is gitignored everywhere; `.env.staging` is committed (test keys)
- [x] `ciyo-web/.env.local` is gitignored (generated file)
- [x] Extension staging testing flow documented (unpacked load)
- [x] Clerk two-instance approach explained — free tier preserved
- [x] DB migration flow for staging DB documented
- [x] `backend/.env.test` is untouched (for E2E test suite)
- [x] `e2e/.env.e2e` is untouched (separate concern)
- [x] No new dependencies required
