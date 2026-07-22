# Monorepo Package Isolation Implementation Plan

**Status: DONE — completed 2026-06-02**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each inner package (`backend`, `mykka-web`, `pretzel`, `pretzel-console`, `e2e`) a fully self-contained pnpm project, then delete all root-level package management artifacts.

**Architecture:** Each package gets its own `pnpm-lock.yaml` and `node_modules`. No root workspace. The `e2e` package gains its own `playwright.config.ts` extracted from the root mega-config (cross-service project only). Root retains only `.gitignore`, `README.md`, `docs/`, `tsconfig.json` (compiler options only), `.github/`, `.superpowers/`.

**Tech Stack:** pnpm, Playwright, Vitest, TypeScript

---

## Files Changed

| File | Action |
|------|--------|
| `backend/package.json` | Modify — add `db:setup` and `check-db` scripts |
| `backend/package-lock.json` | Delete |
| `backend/scripts/db-setup.mjs` | Create (moved from root `scripts/`, paths updated) |
| `backend/scripts/check-db.mjs` | Create (moved from root `scripts/`) |
| `pretzel-console/package-lock.json` | Delete |
| `e2e/playwright.config.ts` | Create |
| `e2e/tsconfig.json` | Create |
| `e2e/package.json` | Modify — update test:e2e script, add `@types/node` |
| `tsconfig.json` (root) | Modify — strip `include`/`exclude`, keep compiler options only |
| `package.json` (root) | Delete |
| `pnpm-lock.yaml` (root) | Delete |
| `pnpm-workspace.yaml` (root) | Delete |
| `playwright.config.ts` (root) | Delete |
| `.env` (root) | Delete |
| `.env.example` (root) | Delete |
| `scripts/` (root) | Delete (after scripts moved to backend) |
| `node_modules/` (root) | Delete |

---

## Task 1: Migrate `backend` from npm to pnpm and move root scripts

**Files:**
- Delete: `backend/package-lock.json`
- Modify: `backend/package.json`
- Create: `backend/scripts/db-setup.mjs`
- Create: `backend/scripts/check-db.mjs`

- [ ] **Step 1: Delete `backend/package-lock.json`**

```powershell
Remove-Item "backend\package-lock.json"
```

- [ ] **Step 2: Add `db:setup` and `check-db` scripts to `backend/package.json`**

In `backend/package.json`, add to the `scripts` object:

```json
"db:setup": "node scripts/db-setup.mjs",
"check-db": "node scripts/check-db.mjs"
```

Full scripts block becomes:
```json
"scripts": {
  "dev": "node --env-file=.env --import tsx/esm --watch src/index.ts",
  "build": "tsc",
  "start": "node --env-file=.env dist/index.js",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "tsx --env-file=.env src/db/migrate.ts",
  "db:setup": "node scripts/db-setup.mjs",
  "check-db": "node scripts/check-db.mjs",
  "test": "vitest run",
  "test:watch": "vitest",
  "seed:e2e": "tsx --env-file=.env src/scripts/seed-e2e.ts",
  "teardown:e2e": "tsx --env-file=.env src/scripts/teardown-e2e.ts",
  "seed:fintech": "tsx --env-file=.env src/scripts/seed-fintech.ts",
  "test:e2e": "playwright test --config playwright.config.ts"
}
```

- [ ] **Step 3: Create `backend/scripts/` directory and move `db-setup.mjs`**

The original script did `chdir(join(__dirname, '..', 'backend'))` to navigate from root to `backend/`. After moving into `backend/scripts/`, `__dirname` is already inside `backend/`, so `..` is enough. Also update `npm run` → `pnpm run`.

Create `backend/scripts/db-setup.mjs`:

```js
import { execSync } from 'child_process'
import { chdir } from 'process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const CONTAINER = 'prompt-saviour-pg'
const VOLUME    = 'prompt-saviour-pg-data'
const DB        = 'promptshield_test'

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', ...opts })
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// 1. Stop and remove old container (ignore if it doesn't exist)
try { execSync(`docker rm -f ${CONTAINER}`, { stdio: 'pipe' }) } catch {}

// 2. Start fresh with a named volume so data survives container deletion
run(
  `docker run -d --name ${CONTAINER}` +
  ` -e POSTGRES_PASSWORD=postgres` +
  ` -e POSTGRES_DB=${DB}` +
  ` -p 5432:5432` +
  ` -v ${VOLUME}:/var/lib/postgresql/data` +
  ` postgres:16`
)

// 3. Wait up to 30s for Postgres to accept connections
process.stdout.write('Waiting for Postgres')
let ready = false
for (let i = 0; i < 30; i++) {
  try {
    execSync(`docker exec ${CONTAINER} pg_isready -U postgres`, { stdio: 'pipe' })
    ready = true
    break
  } catch {
    process.stdout.write('.')
    sleep(1000)
  }
}
if (!ready) {
  console.error('\nPostgres did not start in time — check: docker logs prompt-saviour-pg')
  process.exit(1)
}
console.log(' ready!\n')

// 4. Run migrations and seed from the backend directory
chdir(join(__dirname, '..'))
run('pnpm run db:migrate')
run('pnpm run seed:fintech')

console.log('\n✓ Local DB ready.')
console.log('  Start the backend: pnpm run dev')
```

- [ ] **Step 4: Create `backend/scripts/check-db.mjs`**

No path changes needed — this script only talks to Docker.

```js
import { execSync } from 'child_process'

const CONTAINER = 'prompt-saviour-pg'
const DB        = 'promptshield_test'
const USER      = 'postgres'

function query(label, sql) {
  if (label) console.log(`\n=== ${label} ===`)
  try {
    execSync(`docker exec ${CONTAINER} psql -U ${USER} -d ${DB} -c "${sql.replace(/"/g, '\\"')}"`, { stdio: 'inherit' })
  } catch {
    console.error('Query failed — is the container running? Try: pnpm run db:setup')
    process.exit(1)
  }
}

const customSql = process.argv[2]

if (customSql) {
  query(null, customSql)
} else {
  query('Tenants (check clerk_org_id)', 'SELECT id, name, slug, clerk_org_id FROM tenants;')
  query('Members (check clerk_id and role)', 'SELECT id, email, role, clerk_id FROM members;')
}
```

- [ ] **Step 5: Run `pnpm install` in `backend/`**

```powershell
pnpm --dir backend install
```

Expected: `pnpm-lock.yaml` created in `backend/`, no errors.

- [ ] **Step 6: Run backend tests**

```powershell
pnpm --dir backend test
```

Expected: vitest exits with all tests passing (or same results as before migration).

- [ ] **Step 7: Commit**

```powershell
git add backend/package.json backend/package-lock.json backend/scripts/db-setup.mjs backend/scripts/check-db.mjs backend/pnpm-lock.yaml
git commit -m "chore(backend): migrate to pnpm, move db scripts from root"
```

---

## Task 2: Migrate `pretzel-console` from npm to pnpm

**Files:**
- Delete: `pretzel-console/package-lock.json`

- [ ] **Step 1: Delete `pretzel-console/package-lock.json`**

```powershell
Remove-Item "pretzel-console\package-lock.json"
```

- [ ] **Step 2: Run `pnpm install` in `pretzel-console/`**

```powershell
pnpm --dir pretzel-console install
```

Expected: `pnpm-lock.yaml` created in `pretzel-console/`, no errors.

- [ ] **Step 3: Run pretzel-console tests**

```powershell
pnpm --dir pretzel-console test
```

Expected: vitest exits with all tests passing.

- [ ] **Step 4: Commit**

```powershell
git add pretzel-console/package-lock.json pretzel-console/pnpm-lock.yaml
git commit -m "chore(pretzel-console): migrate to pnpm"
```

---

## Task 3: Generate `pnpm-lock.yaml` for `pretzel`

**Files:**
- Create: `pretzel/pnpm-lock.yaml` (generated)

- [ ] **Step 1: Run `pnpm install` in `pretzel/`**

```powershell
pnpm --dir pretzel install
```

Expected: `pnpm-lock.yaml` created in `pretzel/`, no errors.

- [ ] **Step 2: Run pretzel tests**

```powershell
pnpm --dir pretzel test
```

Expected: vitest exits with all tests passing.

- [ ] **Step 3: Commit**

```powershell
git add pretzel/pnpm-lock.yaml
git commit -m "chore(pretzel): add pnpm-lock.yaml"
```

---

## Task 4: Make `e2e` self-contained

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tsconfig.json`
- Modify: `e2e/package.json`

- [ ] **Step 1: Create `e2e/playwright.config.ts`**

Extracted from root mega-config, cross-service project only. Paths updated relative to `e2e/`.

```ts
import { defineConfig } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

const DIST_PATH = path.resolve(__dirname, '../pretzel/dist')

export default defineConfig({
  globalSetup:    './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  webServer: {
    command: 'node ../pretzel/e2e/fixtures-server.mjs',
    url: 'http://localhost:9876',
    reuseExistingServer: true,
    timeout: 10_000,
  },
  workers: 1,
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'test-results',
  projects: [
    {
      name: 'cross-service',
      use: {
        channel: 'chromium',
        headless: false,
        launchOptions: {
          args: [
            '--headless=new',
            `--disable-extensions-except=${DIST_PATH}`,
            `--load-extension=${DIST_PATH}`,
          ],
        },
      },
      testMatch: 'extension/**/*.spec.ts',
    },
  ],
})
```

- [ ] **Step 2: Create `e2e/tsconfig.json`**

Matches the compiler options that were in the root `tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["."],
  "exclude": ["node_modules", "test-results"]
}
```

- [ ] **Step 3: Update `e2e/package.json`**

Add `@types/node` to devDependencies and update the `test:e2e` script to use the local config (drop `--project=cross-service` — it's the only project now):

```json
{
  "name": "mykka-e2e",
  "version": "0.1.0",
  "description": "Cross-service system contract tests",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test --config playwright.config.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "@types/node": "^20.0.0",
    "dotenv": "^16.4.5"
  }
}
```

- [ ] **Step 4: Run `pnpm install` in `e2e/`**

```powershell
pnpm --dir e2e install
```

Expected: `pnpm-lock.yaml` created in `e2e/`, no errors.

- [ ] **Step 5: Commit**

```powershell
git add e2e/playwright.config.ts e2e/tsconfig.json e2e/package.json e2e/pnpm-lock.yaml
git commit -m "chore(e2e): add own playwright config, tsconfig, migrate to pnpm"
```

---

## Task 5: Clean up root

**Files:**
- Modify: `tsconfig.json` (root)
- Delete: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `playwright.config.ts`, `.env`, `.env.example`, `scripts/`, `node_modules/`

- [ ] **Step 1: Simplify root `tsconfig.json`**

Remove `include` and `exclude` (they referenced `playwright.config.ts` and `e2e`, which are gone or have their own tsconfig now):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 2: Delete root package management files**

```powershell
Remove-Item "package.json"
Remove-Item "pnpm-lock.yaml"
Remove-Item "pnpm-workspace.yaml"
```

- [ ] **Step 3: Delete root playwright config and env files**

```powershell
Remove-Item "playwright.config.ts"
Remove-Item ".env"
Remove-Item ".env.example"
```

- [ ] **Step 4: Delete root `scripts/` directory**

```powershell
Remove-Item -Recurse -Force "scripts"
```

- [ ] **Step 5: Delete root `node_modules/`**

```powershell
Remove-Item -Recurse -Force "node_modules"
```

- [ ] **Step 6: Commit**

```powershell
git add -A
git commit -m "chore(root): remove workspace config, scripts, node_modules, env files"
```

---

## Task 6: Verify all packages

- [ ] **Step 1: Verify backend tests**

```powershell
pnpm --dir backend test
```

Expected: vitest exits 0, all tests pass.

- [ ] **Step 2: Verify pretzel tests**

```powershell
pnpm --dir pretzel test
```

Expected: vitest exits 0, all tests pass.

- [ ] **Step 3: Verify pretzel-console tests**

```powershell
pnpm --dir pretzel-console test
```

Expected: vitest exits 0, all tests pass.

- [ ] **Step 4: Verify mykka-web installs cleanly**

```powershell
pnpm --dir mykka-web install
```

Expected: exits 0 (already had pnpm-lock.yaml, no changes).

- [ ] **Step 5: Verify e2e config is valid (dry-run)**

```powershell
pnpm --dir e2e exec playwright test --config playwright.config.ts --list
```

Expected: lists test files without errors (may show 0 tests if `pretzel/dist` doesn't exist yet — that's fine, the config itself is valid).

- [ ] **Step 6: Final commit if any cleanup needed**

```powershell
git status
```

If clean, no commit needed. If any stray files remain, stage and commit with `chore: final cleanup`.
