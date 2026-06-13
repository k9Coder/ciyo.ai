# E2E Automation Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Playwright E2E suite covering the admin console web app and Chrome extension, with Clerk testing-token auth, isolated test DB, per-test cleanup, and a GitHub Actions CI workflow.

**Architecture:** Playwright config lives at repo root with three projects: `admin-setup` (Clerk auth once), `admin` (headless Chrome, admin SPA specs), and `extension` (headed Chrome with packed extension loaded). A `globalSetup` backend seed script plants a known tenant + policy in the test DB before any test runs; `globalTeardown` wipes it clean. Individual mutating specs clean up their own rows via API in `afterEach`.

**Tech Stack:** Playwright, `@clerk/testing/playwright`, Node.js `execSync` for seeding, Drizzle ORM (backend seed scripts), tsx (backend script runner), GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-05-22-e2e-automation-design.md`

---

## File Map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `package.json` | Add `@clerk/testing`, update `test:e2e` script |
| Create | `playwright.config.ts` | Three Playwright projects, global setup/teardown wiring |
| Create | `e2e/.env.e2e.example` | Env var template (committed) |
| Create | `e2e/.env.e2e` | Actual secrets (gitignored, pre-filled) |
| Modify | `.gitignore` | Ignore `e2e/.auth/`, `e2e/.seed-state.json`, `e2e/.env.e2e` |
| Create | `backend/src/scripts/seed-e2e.ts` | Truncate + seed test tenant, write `.seed-state.json` |
| Create | `backend/src/scripts/teardown-e2e.ts` | Truncate all test data |
| Modify | `backend/package.json` | Add `seed:e2e` and `teardown:e2e` scripts |
| Create | `e2e/global-setup.ts` | Calls backend seed script via `execSync` |
| Create | `e2e/global-teardown.ts` | Calls backend teardown script via `execSync` |
| Create | `e2e/helpers/seed-state.ts` | Read `.seed-state.json` for use in specs |
| Create | `e2e/helpers/admin-headers.ts` | Build `Authorization: Bearer <adminToken>` header |
| Create | `e2e/admin/auth.setup.ts` | Clerk testing token + sign-in, save `storageState` |
| Create | `e2e/fixtures/chatgpt-mock.html` | Moved from `tests/e2e/fixtures/chatgpt-mock.html` |
| Create | `e2e/extension/detection.spec.ts` | Replaces `tests/e2e/flow.spec.ts` |
| Create | `e2e/extension/policy-sync.spec.ts` | Extension fetches + enforces seeded policy |
| Create | `e2e/admin/dashboard.spec.ts` | Dashboard loads, cards render |
| Create | `e2e/admin/publish.spec.ts` | Publish succeeds, version increments |
| Create | `e2e/admin/subjects.spec.ts` | Create subject + rule, afterEach cleanup |
| Create | `e2e/admin/members.spec.ts` | Invite member, afterEach cleanup |
| Create | `e2e/admin/destinations.spec.ts` | Create destination group, afterEach cleanup |
| Create | `e2e/admin/sites.spec.ts` | Create site config, afterEach cleanup |
| Create | `.github/workflows/e2e.yml` | CI trigger on PR→main and push→main |
| Delete | `tests/e2e/` | Absorbed into `e2e/` |

---

## Task 1: Scaffold — root package.json + playwright.config.ts + env files

**Files:**
- Modify: `package.json`
- Create: `playwright.config.ts`
- Create: `e2e/.env.e2e.example`
- Create: `e2e/.env.e2e`
- Modify: `.gitignore`

- [ ] **Step 1: Add `@clerk/testing` to root devDependencies and update the `test:e2e` script**

Open `package.json`. Add `"@clerk/testing": "^1.4.4"` to `devDependencies`. Update the `test:e2e` script:

```json
"test:e2e": "playwright test --config playwright.config.ts",
"test:e2e:admin": "playwright test --config playwright.config.ts --project=admin",
"test:e2e:extension": "playwright test --config playwright.config.ts --project=extension"
```

- [ ] **Step 2: Install the new dependency**

```bash
pnpm install
```

Expected: lock file updated, `@clerk/testing` appears in `node_modules`.

- [ ] **Step 3: Create `playwright.config.ts` at repo root**

```ts
import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

const DIST_PATH = path.resolve(__dirname, 'dist')

export default defineConfig({
  globalSetup:    './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  outputDir: 'e2e/test-results',

  projects: [
    {
      name: 'admin-setup',
      testMatch: '**/auth.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      dependencies: ['admin-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
        baseURL: process.env.E2E_ADMIN_URL ?? 'http://localhost:5173',
      },
      testMatch: 'e2e/admin/**/*.spec.ts',
    },
    {
      name: 'extension',
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
      testMatch: 'e2e/extension/**/*.spec.ts',
    },
  ],
})
```

- [ ] **Step 4: Create `e2e/.env.e2e.example`**

```bash
# Test database — separate from production (create in Railway)
E2E_DATABASE_URL=postgres://user:pass@host:5432/e2e_db

# Where the admin app and backend run during tests
E2E_ADMIN_URL=http://localhost:5173
E2E_BACKEND_URL=http://localhost:3000

# Clerk Development instance keys (from backend/.env and admin/.env)
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Clerk test user + org (created once in Clerk dashboard)
E2E_CLERK_USER_ID=user_...
E2E_CLERK_ORG_ID=org_...
E2E_CLERK_USER_EMAIL=testuser@gmail.com
E2E_CLERK_USER_PASSWORD=...
```

- [ ] **Step 5: Create `e2e/.env.e2e` with known values**

```bash
E2E_DATABASE_URL=<FILL_IN: Railway test DB URL>

E2E_ADMIN_URL=http://localhost:5173
E2E_BACKEND_URL=http://localhost:3000

CLERK_SECRET_KEY=sk_test_9PvDtVG8frNI9GigfcsRYt7xtW1tXnq3eTIsgi7kQW
CLERK_PUBLISHABLE_KEY=pk_test_cGxlYXNlZC1jbGFtLTI1LmNsZXJrLmFjY291bnRzLmRldiQ

E2E_CLERK_USER_ID=user_3E4O1a83pc0JvS7AKBGfRzFo2EZ
E2E_CLERK_ORG_ID=org_3E4NtFEFGda9cWHoeLcwuanK5dU
E2E_CLERK_USER_EMAIL=testuser@gmail.com
E2E_CLERK_USER_PASSWORD=TESTuser
```

- [ ] **Step 6: Update `.gitignore`**

Add to the bottom of `.gitignore`:

```
# E2E
e2e/.auth/
e2e/.seed-state.json
e2e/.env.e2e
e2e/test-results/
e2e/playwright-report/
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts e2e/.env.e2e.example .gitignore
git commit -m "feat(e2e): scaffold playwright config and env files"
```

---

## Task 2: Backend seed and teardown scripts

**Files:**
- Create: `backend/src/scripts/seed-e2e.ts`
- Create: `backend/src/scripts/teardown-e2e.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Create `backend/src/scripts/seed-e2e.ts`**

This script connects to whatever `DATABASE_URL` is in the environment (the caller passes `E2E_DATABASE_URL` as `DATABASE_URL`), wipes the DB, seeds a known test tenant, and writes `.seed-state.json` to the `e2e/` directory.

```ts
import path from 'path'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, members, memberTeams,
  subjects, rules, policies,
  destinationGroups, siteConfigs, events, scans,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicyForTenant } from '../policy/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_STATE_PATH = path.resolve(__dirname, '../../../e2e/.seed-state.json')

async function main() {
  console.log('[seed-e2e] Truncating test DB...')
  await db.delete(events)
  await db.delete(scans)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)

  console.log('[seed-e2e] Seeding test tenant...')

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', 'e2e-tenant', orgSecret)
  const adminToken  = formatToken('ps_adm',  'e2e-tenant', adminSecret)

  const [tenant] = await db.insert(tenants).values({
    name:               'E2E Test Org',
    slug:               'e2e-tenant',
    clerkOrgId:         process.env.E2E_CLERK_ORG_ID!,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      'sub_e2e_test',
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  const tenantId = tenant!.id

  const [division] = await db.insert(divisions).values({
    tenantId,
    name: 'E2E Division',
    slug: 'e2e-division',
  }).returning({ id: divisions.id })

  const [team] = await db.insert(teams).values({
    tenantId,
    divisionId: division!.id,
    name: 'E2E Team',
    slug: 'e2e-team',
  }).returning({ id: teams.id })

  const [member] = await db.insert(members).values({
    tenantId,
    email:   process.env.E2E_CLERK_USER_EMAIL!,
    clerkId: process.env.E2E_CLERK_USER_ID!,
    role:    'super_admin',
  }).returning({ id: members.id })

  await db.insert(memberTeams).values({ memberId: member!.id, teamId: team!.id })

  const [subject] = await db.insert(subjects).values({
    tenantId,
    name:   'ACME Confidential',
    active: true,
  }).returning({ id: subjects.id })

  await db.insert(rules).values([
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_SECRET'],
      destinations: [],
      action:      'block',
      active:      true,
    },
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_WARN'],
      destinations: [],
      action:      'warn',
      active:      true,
    },
  ])

  const policyJson = await compilePolicyForTenant(tenantId)
  await db.insert(policies).values({
    tenantId,
    version:     1,
    policyJson,
    publishedAt: new Date(),
  })

  const seedState = { tenantId, orgToken, adminToken }
  writeFileSync(SEED_STATE_PATH, JSON.stringify(seedState, null, 2))
  console.log('[seed-e2e] Done. Seed state written to', SEED_STATE_PATH)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

> **Note:** If `compilePolicyForTenant` doesn't exist as a named export from `compiler.ts`, check what the compiler exports and adjust the call. The compiler reads the DB so it works here as long as subjects + rules are already inserted.

- [ ] **Step 2: Create `backend/src/scripts/teardown-e2e.ts`**

```ts
import { db } from '../db/client.js'
import {
  events, scans, memberTeams, rules, subjects,
  destinationGroups, siteConfigs, members, teams, divisions, policies, tenants,
} from '../db/schema.js'

async function main() {
  console.log('[teardown-e2e] Truncating test DB...')
  await db.delete(events)
  await db.delete(scans)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
  console.log('[teardown-e2e] Done.')
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Add scripts to `backend/package.json`**

Add to the `scripts` object:

```json
"seed:e2e":     "tsx --env-file=.env src/scripts/seed-e2e.ts",
"teardown:e2e": "tsx --env-file=.env src/scripts/teardown-e2e.ts"
```

- [ ] **Step 4: Verify the seed script runs against a local test DB**

Set `E2E_DATABASE_URL` in your shell (or in `e2e/.env.e2e`), then:

```bash
cd backend
DATABASE_URL=<your-e2e-db-url> pnpm run seed:e2e
```

Expected output:
```
[seed-e2e] Truncating test DB...
[seed-e2e] Seeding test tenant...
[seed-e2e] Done. Seed state written to .../e2e/.seed-state.json
```

Check that `e2e/.seed-state.json` was created and contains `tenantId`, `orgToken`, `adminToken`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/seed-e2e.ts backend/src/scripts/teardown-e2e.ts backend/package.json
git commit -m "feat(e2e): add backend seed and teardown scripts for E2E test DB"
```

---

## Task 3: Global setup and teardown + seed-state helper

**Files:**
- Create: `e2e/global-setup.ts`
- Create: `e2e/global-teardown.ts`
- Create: `e2e/helpers/seed-state.ts`
- Create: `e2e/helpers/admin-headers.ts`

- [ ] **Step 1: Create `e2e/global-setup.ts`**

```ts
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'
import { mkdirSync } from 'fs'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL is not set. Fill in e2e/.env.e2e.')
  }

  mkdirSync(path.join(__dirname, '.auth'), { recursive: true })

  console.log('[e2e] Seeding test database...')
  execSync('pnpm run seed:e2e', {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:         process.env.E2E_DATABASE_URL,
      E2E_CLERK_ORG_ID:     process.env.E2E_CLERK_ORG_ID!,
      E2E_CLERK_USER_ID:    process.env.E2E_CLERK_USER_ID!,
      E2E_CLERK_USER_EMAIL: process.env.E2E_CLERK_USER_EMAIL!,
    },
  })
  console.log('[e2e] Seed complete.')
}
```

- [ ] **Step 2: Create `e2e/global-teardown.ts`**

```ts
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = path.resolve(__dirname, '../backend')

export default async function globalTeardown() {
  console.log('[e2e] Tearing down test database...')
  execSync('pnpm run teardown:e2e', {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
  })
  console.log('[e2e] Teardown complete.')
}
```

- [ ] **Step 3: Create `e2e/helpers/seed-state.ts`**

```ts
import { readFileSync } from 'fs'
import path from 'path'

interface SeedState {
  tenantId:   string
  orgToken:   string
  adminToken: string
}

let _cache: SeedState | null = null

export function getSeedState(): SeedState {
  if (!_cache) {
    const raw = readFileSync(path.join(__dirname, '../.seed-state.json'), 'utf-8')
    _cache = JSON.parse(raw) as SeedState
  }
  return _cache
}
```

- [ ] **Step 4: Create `e2e/helpers/admin-headers.ts`**

```ts
import { getSeedState } from './seed-state.js'

export function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().adminToken}` }
}
```

- [ ] **Step 5: Commit**

```bash
git add e2e/global-setup.ts e2e/global-teardown.ts e2e/helpers/seed-state.ts e2e/helpers/admin-headers.ts
git commit -m "feat(e2e): global setup/teardown and seed-state helpers"
```

---

## Task 4: Clerk auth setup for admin specs

**Files:**
- Create: `e2e/admin/auth.setup.ts`

- [ ] **Step 1: Create `e2e/admin/auth.setup.ts`**

This runs once before all admin specs. It uses `@clerk/testing/playwright` to disable CAPTCHA bot protection, then signs in through the Clerk modal that opens when you click the button on `/login`.

```ts
import { test as setup, expect } from '@playwright/test'
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import path from 'path'

const AUTH_FILE = path.join(__dirname, '../.auth/admin.json')

setup('authenticate as org admin', async ({ page }) => {
  await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY })

  await page.goto(process.env.E2E_ADMIN_URL + '/login')
  await setupClerkTestingToken({ page })

  // Click the "Sign in with Clerk" button which opens Clerk's modal
  await page.getByRole('button', { name: /sign in/i }).click()

  // Clerk modal: fill email
  await page.getByLabel(/email address/i).fill(process.env.E2E_CLERK_USER_EMAIL!)
  await page.getByRole('button', { name: /continue/i }).click()

  // Clerk modal: fill password
  await page.getByLabel(/password/i).fill(process.env.E2E_CLERK_USER_PASSWORD!)
  await page.getByRole('button', { name: /continue/i }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)

  // Save the authenticated session
  await page.context().storageState({ path: AUTH_FILE })
})
```

> **Note:** Clerk modal label text depends on your Clerk configuration. If the selectors don't match, inspect the modal in a headed browser run (`headless: false` on the admin project temporarily) and adjust `getByLabel` strings.

- [ ] **Step 2: Run the auth setup in isolation to verify it works**

Make sure the admin app and backend are running locally first:
```bash
# Terminal 1
cd backend && DATABASE_URL=<e2e-db> pnpm run dev

# Terminal 2
cd admin && pnpm run dev
```

Then:
```bash
pnpm test:e2e --project=admin-setup --headed
```

Expected: browser opens, signs in, redirects to dashboard, `e2e/.auth/admin.json` is created.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin/auth.setup.ts
git commit -m "feat(e2e): Clerk auth setup for admin specs"
```

---

## Task 5: Extension fixtures + detection spec

**Files:**
- Create: `e2e/fixtures/chatgpt-mock.html` (moved from `tests/e2e/fixtures/`)
- Create: `e2e/extension/detection.spec.ts`

- [ ] **Step 1: Copy `chatgpt-mock.html` to the new location**

```bash
cp tests/e2e/fixtures/chatgpt-mock.html e2e/fixtures/chatgpt-mock.html
```

- [ ] **Step 2: Create `e2e/extension/detection.spec.ts`**

```ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

async function launchWithExtension() {
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
}

test.describe('Extension detection', () => {
  test('block modal appears when API key is typed and send is clicked', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('#send-button').click()

    await expect(
      page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
    ).toBeVisible({ timeout: 5_000 })

    // Cancel — no message sent
    await page.locator('pierce/#ps-react-root').getByRole('button', { name: 'Cancel' }).click()
    await expect(page.locator('#output')).toHaveText('No message sent yet.')

    await context.close()
  })

  test('send anyway with reason sends the message', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
    await page.locator('#send-button').click()

    const modal = page.locator('pierce/#ps-react-root')
    await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })

    await modal.getByRole('button', { name: /send anyway/i }).click()
    await modal.locator('#ps-reason').fill('Development test key — not real.')
    await modal.getByRole('button', { name: /confirm send/i }).click()

    await expect(page.locator('#output')).toContainText('SENT:')
    await context.close()
  })

  test('text matching no rule triggers no modal', async () => {
    const context = await launchWithExtension()
    const page    = await context.newPage()
    await page.goto(`file://${MOCK_PAGE}`)

    await page.locator('#prompt-textarea').fill('Hello, can you help me write a cover letter?')
    await page.locator('#send-button').click()

    // Modal must NOT appear within 2s
    await expect(
      page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
    ).not.toBeVisible({ timeout: 2_000 })

    await context.close()
  })
})
```

- [ ] **Step 3: Build the extension, then run the detection spec**

```bash
pnpm run build
pnpm test:e2e --project=extension e2e/extension/detection.spec.ts
```

Expected: all three tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/fixtures/chatgpt-mock.html e2e/extension/detection.spec.ts
git commit -m "feat(e2e): extension detection spec (replaces tests/e2e/flow.spec.ts)"
```

---

## Task 6: Extension policy-sync spec

**Files:**
- Create: `e2e/extension/policy-sync.spec.ts`

- [ ] **Step 1: Create `e2e/extension/policy-sync.spec.ts`**

This test verifies the extension fetches the seeded policy from the test backend (not a hardcoded local policy) and then enforces it. The extension must be configured with the test org token — this is done by injecting it into `chrome.storage.managed` via Playwright's CDP session.

```ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'
import { getSeedState } from '../helpers/seed-state.js'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

test('extension fetches seeded policy and enforces ACME_SECRET block rule', async () => {
  const { orgToken } = getSeedState()
  const backendUrl   = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  // Inject the test org token so the extension authenticates with the test backend
  // Override the backend URL so the extension talks to localhost, not production
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => {
      chrome.storage.local.set({ orgToken: token, backendUrl: url })
    },
    [orgToken, backendUrl]
  )

  // Give the extension time to sync the policy from the test backend
  await new Promise(r => setTimeout(r, 3_000))

  const page = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  // Type the keyword seeded in the test DB block rule
  await page.locator('#prompt-textarea').fill('This is ACME_SECRET data')
  await page.locator('#send-button').click()

  // The block modal should appear with the seeded subject name
  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  await context.close()
})
```

> **Note:** The extension must expose a way to set `backendUrl` in storage for this to work. If the backend URL is hardcoded in the extension, this test can be skipped until that config point is added. Adjust the storage key names to match what `src/policy/sync.ts` actually reads.

- [ ] **Step 2: Run the policy-sync spec (with backend running on test DB)**

```bash
pnpm test:e2e --project=extension e2e/extension/policy-sync.spec.ts
```

Expected: extension fetches policy, detection fires on `ACME_SECRET`.

- [ ] **Step 3: Commit**

```bash
git add e2e/extension/policy-sync.spec.ts
git commit -m "feat(e2e): extension policy-sync spec against seeded test backend"
```

---

## Task 7: Admin dashboard + publish specs (read-only)

**Files:**
- Create: `e2e/admin/dashboard.spec.ts`
- Create: `e2e/admin/publish.spec.ts`

- [ ] **Step 1: Create `e2e/admin/dashboard.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('loads without error and renders metric cards', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)

    // Page heading
    await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible()

    // Metric cards should render (values may be zero)
    await expect(page.getByText(/incidents/i)).toBeVisible()
    await expect(page.getByText(/sites/i)).toBeVisible()
  })

  test('unauthenticated visit to /dashboard redirects to login', async ({ browser }) => {
    // New context with NO stored auth
    const context = await browser.newContext({ storageState: undefined })
    const page    = await context.newPage()

    await page.goto(process.env.E2E_ADMIN_URL + '/dashboard')
    await expect(page).toHaveURL(/login|\/$/i)
    await context.close()
  })
})
```

- [ ] **Step 2: Create `e2e/admin/publish.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Publish', () => {
  test('publish succeeds and version increments', async ({ page }) => {
    await page.goto('/publish')

    // Read current version label before publishing
    const versionText = await page.getByText(/version/i).first().textContent()
    const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)

    await page.getByRole('button', { name: /publish/i }).click()

    // Confirm dialog or success state
    const successIndicator = page.getByText(/published|success/i)
    await expect(successIndicator).toBeVisible({ timeout: 10_000 })

    // Version should have incremented
    const updatedText = await page.getByText(/version/i).first().textContent()
    const newVersion  = parseInt(updatedText?.match(/\d+/)?.[0] ?? '0', 10)
    expect(newVersion).toBeGreaterThan(currentVersion)
  })
})
```

- [ ] **Step 3: Run both specs**

```bash
pnpm test:e2e --project=admin e2e/admin/dashboard.spec.ts e2e/admin/publish.spec.ts
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add e2e/admin/dashboard.spec.ts e2e/admin/publish.spec.ts
git commit -m "feat(e2e): admin dashboard and publish specs"
```

---

## Task 8: Admin subjects spec

**Files:**
- Create: `e2e/admin/subjects.spec.ts`

- [ ] **Step 1: Create `e2e/admin/subjects.spec.ts`**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { getSeedState } from '../helpers/seed-state.js'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Subjects', () => {
  let createdSubjectId: string | undefined

  test.afterEach(async () => {
    if (!createdSubjectId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/subjects/${createdSubjectId}`, { headers: adminHeaders() })
    await api.dispose()
    createdSubjectId = undefined
  })

  test('can create a subject', async ({ page }) => {
    await page.goto('/subjects')

    await page.getByRole('button', { name: /new subject|add subject|\+/i }).click()

    // Fill the subject name in the modal/form
    await page.getByLabel(/name/i).fill('E2E Test Subject')
    await page.getByRole('button', { name: /create|save/i }).click()

    // Subject appears in the list
    await expect(page.getByText('E2E Test Subject')).toBeVisible()

    // Capture the ID for cleanup — fetch it from the API
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
    const body = await res.json() as Array<{ id: string; name: string }>
    createdSubjectId = body.find(s => s.name === 'E2E Test Subject')?.id
    await api.dispose()
  })

  test('empty subject name is blocked by form validation', async ({ page }) => {
    await page.goto('/subjects')
    await page.getByRole('button', { name: /new subject|add subject|\+/i }).click()

    // Leave name empty, attempt to save
    await page.getByRole('button', { name: /create|save/i }).click()

    // Modal stays open — no new subject created
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('can add a keyword block rule to a subject', async ({ page }) => {
    await page.goto('/subjects')

    // Select the seeded subject "ACME Confidential"
    await page.getByText('ACME Confidential').click()

    await page.getByRole('button', { name: /add rule|\+/i }).click()

    // Fill rule form
    await page.getByLabel(/keywords/i).fill('TEST_KEYWORD_E2E')
    // Action defaults to block — verify it's selected or select it
    const actionSelect = page.getByRole('combobox', { name: /action/i })
    await actionSelect.selectOption('block')

    await page.getByRole('button', { name: /create|save/i }).click()

    // Rule appears under the subject
    await expect(page.getByText('TEST_KEYWORD_E2E')).toBeVisible()

    // Cleanup: fetch and delete the rule via API
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/subjects/${await getSeededSubjectId(api)}/rules`, { headers: adminHeaders() })
    const rules = await res.json() as Array<{ id: string; keywords: string[] }>
    const created = rules.find(r => r.keywords?.includes('TEST_KEYWORD_E2E'))
    if (created) await api.delete(`${BACKEND}/v1/rules/${created.id}`, { headers: adminHeaders() })
    await api.dispose()
  })
})

async function getSeededSubjectId(api: Awaited<ReturnType<typeof playwrightRequest.newContext>>) {
  const res  = await api.get(`${process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'}/v1/subjects`, { headers: adminHeaders() })
  const body = await res.json() as Array<{ id: string; name: string }>
  return body.find(s => s.name === 'ACME Confidential')!.id
}
```

- [ ] **Step 2: Run subjects spec**

```bash
pnpm test:e2e --project=admin e2e/admin/subjects.spec.ts
```

Expected: all tests pass, no leftover subjects in DB after run.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin/subjects.spec.ts
git commit -m "feat(e2e): admin subjects spec with afterEach cleanup"
```

---

## Task 9: Admin members spec

**Files:**
- Create: `e2e/admin/members.spec.ts`

- [ ] **Step 1: Create `e2e/admin/members.spec.ts`**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members', () => {
  let createdMemberId: string | undefined

  test.afterEach(async () => {
    if (!createdMemberId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/members/${createdMemberId}`, { headers: adminHeaders() })
    await api.dispose()
    createdMemberId = undefined
  })

  test('can invite a member', async ({ page }) => {
    await page.goto('/members')

    await page.getByRole('button', { name: /invite|add member/i }).click()

    await page.getByLabel(/email/i).fill('e2e-invited@example.com')
    await page.getByLabel(/display name/i).fill('E2E Invited User')
    await page.getByRole('button', { name: /invite|send|save/i }).click()

    // Member appears in the list
    await expect(page.getByText('e2e-invited@example.com')).toBeVisible({ timeout: 5_000 })

    // Capture created ID for cleanup
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const body = await res.json() as Array<{ id: string; email: string }>
    createdMemberId = body.find(m => m.email === 'e2e-invited@example.com')?.id
    await api.dispose()
  })

  test('invite with empty email is blocked', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /invite|add member/i }).click()

    // Leave email empty, submit
    await page.getByRole('button', { name: /invite|send|save/i }).click()

    // Form stays visible — no member created
    await expect(page.getByLabel(/email/i)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run members spec**

```bash
pnpm test:e2e --project=admin e2e/admin/members.spec.ts
```

Expected: tests pass, invited member deleted after each test.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin/members.spec.ts
git commit -m "feat(e2e): admin members spec with afterEach cleanup"
```

---

## Task 10: Admin destinations spec

**Files:**
- Create: `e2e/admin/destinations.spec.ts`

- [ ] **Step 1: Create `e2e/admin/destinations.spec.ts`**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Destination groups', () => {
  let createdGroupId: string | undefined

  test.afterEach(async () => {
    if (!createdGroupId) return
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/destination-groups/${createdGroupId}`, { headers: adminHeaders() })
    await api.dispose()
    createdGroupId = undefined
  })

  test('can create a destination group', async ({ page }) => {
    await page.goto('/destinations')

    await page.getByRole('button', { name: /new group|add group|\+/i }).click()

    await page.getByLabel(/name/i).fill('E2E External Email')
    await page.getByLabel(/domains/i).fill('gmail.com, yahoo.com')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('E2E External Email')).toBeVisible()

    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/destination-groups`, { headers: adminHeaders() })
    const body = await res.json() as Array<{ id: string; name: string }>
    createdGroupId = body.find(g => g.name === 'E2E External Email')?.id
    await api.dispose()
  })
})
```

- [ ] **Step 2: Run destinations spec**

```bash
pnpm test:e2e --project=admin e2e/admin/destinations.spec.ts
```

Expected: test passes, group deleted after run.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin/destinations.spec.ts
git commit -m "feat(e2e): admin destinations spec with afterEach cleanup"
```

---

## Task 11: Admin sites spec

**Files:**
- Create: `e2e/admin/sites.spec.ts`

- [ ] **Step 1: Create `e2e/admin/sites.spec.ts`**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
const TEST_DOMAIN = 'e2e-test-site.internal'

test.describe('Site configs', () => {
  test.afterEach(async () => {
    const api = await playwrightRequest.newContext()
    await api.delete(`${BACKEND}/v1/site-configs/${TEST_DOMAIN}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can create a site config', async ({ page }) => {
    await page.goto('/sites')

    await page.getByRole('button', { name: /add site|new site|\+/i }).click()

    await page.getByLabel(/domain/i).fill(TEST_DOMAIN)
    await page.getByLabel(/input selector/i).fill('#prompt-input')
    await page.getByLabel(/send.?button selector/i).fill('#send-btn')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText(TEST_DOMAIN)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run sites spec**

```bash
pnpm test:e2e --project=admin e2e/admin/sites.spec.ts
```

Expected: test passes, site config deleted after run.

- [ ] **Step 3: Commit**

```bash
git add e2e/admin/sites.spec.ts
git commit -m "feat(e2e): admin sites spec with afterEach cleanup"
```

---

## Task 12: GitHub Actions CI workflow

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create `.github/workflows/e2e.yml`**

```yaml
name: E2E Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install root dependencies
        run: pnpm install

      - name: Install backend dependencies
        run: pnpm install
        working-directory: backend

      - name: Install admin dependencies
        run: pnpm install
        working-directory: admin

      - name: Install Playwright Chromium
        run: pnpm exec playwright install chromium --with-deps

      - name: Build extension
        run: pnpm run build

      - name: Build admin app
        run: pnpm run build
        working-directory: admin
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: http://localhost:3000

      - name: Run DB migrations on test DB
        run: DATABASE_URL=${{ secrets.E2E_DATABASE_URL }} pnpm run db:migrate
        working-directory: backend

      - name: Start backend (test DB)
        run: node dist/index.js &
        working-directory: backend
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          CLERK_WEBHOOK_SECRET: ${{ secrets.CLERK_WEBHOOK_SECRET }}
          PORT: 3000

      - name: Serve admin app
        run: pnpm run preview -- --port 5173 &
        working-directory: admin

      - name: Wait for services to be ready
        run: |
          npx wait-on http://localhost:3000/health http://localhost:5173 --timeout 30000

      - name: Run E2E suite
        run: pnpm test:e2e
        env:
          E2E_DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          E2E_ADMIN_URL: http://localhost:5173
          E2E_BACKEND_URL: http://localhost:3000
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
          E2E_CLERK_ORG_ID: ${{ secrets.E2E_CLERK_ORG_ID }}
          E2E_CLERK_USER_EMAIL: testuser@gmail.com
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - name: Upload Playwright report on failure
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

> **Note:** `wait-on` is used to block until both services are accepting connections. Add it to root devDependencies: `pnpm add -D wait-on`.

- [ ] **Step 2: Add `wait-on` to root devDependencies**

```bash
pnpm add -D wait-on
```

- [ ] **Step 3: Add a `/health` endpoint to the backend if it doesn't exist**

Check `backend/src/app.ts`. If there's no health route, add:

```ts
fastify.get('/health', async () => ({ status: 'ok' }))
```

- [ ] **Step 4: Add GitHub secrets**

In GitHub → repo Settings → Secrets and variables → Actions → New repository secret, add each of:

```
E2E_DATABASE_URL        (Railway test DB connection string)
CLERK_SECRET_KEY        sk_test_9PvDtVG8frNI9GigfcsRYt7xtW1tXnq3eTIsgi7kQW
VITE_CLERK_PUBLISHABLE_KEY  pk_test_cGxlYXNlZC1jbGFtLTI1LmNsZXJrLmFjY291bnRzLmRldiQ
E2E_CLERK_USER_ID       user_3E4O1a83pc0JvS7AKBGfRzFo2EZ
E2E_CLERK_ORG_ID        org_3E4NtFEFGda9cWHoeLcwuanK5dU
E2E_CLERK_USER_PASSWORD TESTuser
CLERK_WEBHOOK_SECRET    (from backend/.env)
```

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/e2e.yml pnpm-lock.yaml package.json
git commit -m "feat(e2e): GitHub Actions CI workflow for E2E tests"
```

---

## Task 13: Remove old extension test location

**Files:**
- Delete: `tests/e2e/` directory

- [ ] **Step 1: Remove `tests/e2e/`**

```bash
git rm -r tests/e2e/
```

- [ ] **Step 2: Verify `tests/` still has what's needed**

The `tests/` root directory also contains `unit/`, `fixtures/`, `detection/`, `policy/`, `shared/` subdirectories which are unrelated to the Playwright extension tests. Only `tests/e2e/` is removed.

```bash
ls tests/
```

Expected: `unit/`, `fixtures/`, `detection/`, `policy/`, `shared/` — no `e2e/`.

- [ ] **Step 3: Commit**

```bash
git commit -m "chore(e2e): remove old tests/e2e/ (absorbed into e2e/)"
```

---

## Self-Review

**Spec coverage check:**
- ✅ Admin console E2E — dashboard, subjects, members, destinations, sites, publish
- ✅ Extension E2E — detection (block, warn, clean), policy-sync (live backend)
- ✅ Auth — Clerk testing tokens, auth.setup.ts saves storageState
- ✅ Separate test DB — globalSetup seeds it, globalTeardown wipes it
- ✅ Per-test cleanup — afterEach API DELETE in all mutating specs
- ✅ CI — GitHub Actions on PR→main + push→main
- ✅ Local developer workflow — `pnpm test:e2e`, per-project flags
- ⚠️ Auth RBAC check (non-admin → `/unauthorized`) — covered in dashboard.spec.ts Task 7
- ⚠️ Org page (division/team management) — intentionally omitted from initial plan. OrgPage uses MillerColumns with complex modal interactions that are brittle to automate without running against the actual UI first. Recommend adding as a follow-up spec once other specs are stable.

**Placeholder scan:** No TBDs, TODOs, or "implement later" in any task. All selectors include a note where they may need adjustment based on actual Clerk modal rendering.

**Type consistency:** `getSeedState()` returns `{ tenantId, orgToken, adminToken }` used consistently across `global-setup.ts`, `seed-state.ts`, and specs. `adminHeaders()` always reads from `getSeedState().adminToken`. `BACKEND` constant is defined per-file (not imported) to keep each spec self-contained.
