# E2E Automation Testing — Design Spec

**Date:** 2026-05-22
**Status:** Approved for implementation

---

## Goal

Stand up a Playwright E2E automation suite covering the admin console web app and the Chrome extension. Tests run locally by any developer and automatically on PRs targeting `main` + on pushes to `main` via GitHub Actions. The suite acts as a sanity/regression gate — not a replacement for the existing backend Vitest integration tests, which remain authoritative for API correctness.

---

## Decisions

| Question | Decision |
|---|---|
| Scope | Admin console E2E + Chrome extension E2E (both) |
| Auth mechanism | Clerk testing tokens (`@clerk/testing/playwright`) |
| Test database | Separate Postgres (not production) via `E2E_DATABASE_URL` |
| CI trigger | PRs → `main` + pushes to `main` |
| Cleanup strategy | `afterEach` API-level cleanup per spec + `globalTeardown` truncates all |

---

## Folder Structure

Lives at repo root as `e2e/`. The existing `tests/e2e/` (extension smoke tests) is absorbed into this new location and removed.

```
e2e/
  package.json                  ← @playwright/test, @clerk/testing, dotenv
  playwright.config.ts          ← three Playwright projects: admin-setup, admin, extension
  .env.e2e.example              ← documents required env vars (committed)
  .env.e2e                      ← actual secrets (gitignored)

  admin/
    auth.setup.ts               ← runs once: Clerk test token → saves storageState
    dashboard.spec.ts
    subjects.spec.ts
    members.spec.ts
    publish.spec.ts
    destinations.spec.ts
    sites.spec.ts

  extension/
    detection.spec.ts           ← replaces tests/e2e/flow.spec.ts
    policy-sync.spec.ts         ← verifies extension fetches + enforces seeded policy

  helpers/
    db.ts                       ← re-exports buildTestTenant + truncateAll from backend
    clerk.ts                    ← Clerk testing token helpers
    seed.ts                     ← seeds full test tenant; writes .seed-state.json

  fixtures/
    chatgpt-mock.html           ← moved from tests/e2e/fixtures/

  .auth/                        ← gitignored; holds saved Clerk session JSON
```

---

## Playwright Config

Three projects:

```ts
projects: [
  {
    name: 'admin-setup',
    testMatch: '**/auth.setup.ts',
  },
  {
    name: 'admin',
    dependencies: ['admin-setup'],
    use: {
      storageState: 'e2e/.auth/admin.json',
      baseURL: process.env.E2E_ADMIN_URL,
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
          `--load-extension=${DIST_PATH}`,
          `--disable-extensions-except=${DIST_PATH}`,
        ],
      },
    },
    testMatch: 'e2e/extension/**/*.spec.ts',
  },
]
```

`globalSetup` and `globalTeardown` are wired in the config for DB seed/teardown.

---

## Auth Setup

`@clerk/testing/playwright` generates bypass tokens for the Development Clerk instance. This disables bot-protection so tests can sign in programmatically without CAPTCHA.

**`admin/auth.setup.ts`:**
```ts
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

setup('authenticate as org admin', async ({ page }) => {
  await clerkSetup()
  await setupClerkTestingToken({ page })
  await page.goto(process.env.E2E_ADMIN_URL!)
  await page.getByRole('button', { name: /sign in/i }).click()
  await page.getByLabel(/email/i).fill(process.env.E2E_CLERK_USER_EMAIL!)
  await page.getByLabel(/password/i).fill(process.env.E2E_CLERK_USER_PASSWORD!)
  await page.getByRole('button', { name: /continue|sign in/i }).click()
  await page.waitForURL('**/dashboard')
  await page.context().storageState({ path: 'e2e/.auth/admin.json' })
})
```

All admin specs start from the saved session — no repeated login.

**Clerk test credentials (one-time manual setup — already done):**
- Test user: `testuser@gmail.com` / `TESTuser`
- Test org: `Test's Organization`
- `E2E_CLERK_USER_ID`: `user_3E4O1a83pc0JvS7AKBGfRzFo2EZ`
- `E2E_CLERK_ORG_ID`: `org_3E4NtFEFGda9cWHoeLcwuanK5dU`

---

## DB Seeding Strategy

`helpers/seed.ts` runs in `globalSetup`, pointing at `E2E_DATABASE_URL`.

**Seed sequence:**
1. `truncateAll()` — wipe test DB clean
2. `buildTestTenant('e2e-tenant')` — tenant + org/admin tokens
3. Insert division: `"E2E Division"`
4. Insert team: `"E2E Team"`
5. Insert member (`clerkId = E2E_CLERK_USER_ID`, `role = super_admin`)
6. Insert subject: `"ACME Confidential"`
7. Insert rule: `keywords=["ACME_SECRET"]`, `action=block`
8. Insert rule: `keywords=["ACME_WARN"]`, `action=warn`
9. `POST /v1/policy/publish` — snapshot stored
10. Write `{ orgToken, tenantId, adminToken }` to `e2e/.seed-state.json` (gitignored)

**`globalTeardown`:** calls `truncateAll()` unconditionally — runs even if the suite crashes.

The base seeded data is **read-only** during tests. Individual tests never modify it.

---

## Cleanup Strategy

Two layers:

**Layer 1 — `afterEach` API cleanup per spec.**
Any test that creates a row (member, subject, rule, destination group, site config) tracks the created ID and deletes it via the backend REST API in `afterEach`. Uses `adminToken` from `.seed-state.json`.

```ts
let createdId: string | undefined

test.afterEach(async ({ request }) => {
  if (createdId) {
    await request.delete(`${E2E_BACKEND_URL}/v1/members/${createdId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    })
    createdId = undefined
  }
})
```

**Layer 2 — `globalTeardown` truncate.**
Safety net that wipes everything regardless of whether `afterEach` hooks completed. Prevents accumulation between runs even on failures.

**Rule:** read-only tests (dashboard, publish, policy-sync) have zero cleanup code. Only mutating tests carry `afterEach`.

---

## Test Suite

### Admin console

**Auth & access control**
- Org admin logs in → lands on `/dashboard`
- Non-admin member → lands on `/unauthorized`
- Unauthenticated → redirected to `/` (login)

**Org management (`/org`)**
- Can create a division → `afterEach` deletes it
- Can create a team in a division → `afterEach` deletes it
- Can add a member by email → `afterEach` deletes them
- Division admin cannot see another division's data (RBAC check)

**Policy authoring (`/subjects`)**
- Can create a subject → `afterEach` deletes it
- Can add a keyword rule (action: warn) → `afterEach` deletes it
- Can add a keyword rule (action: block) → `afterEach` deletes it
- Can add a pattern (regex) rule → `afterEach` deletes it
- Empty subject name blocked by form validation (no server call)
- Rule with no keywords/pattern blocked by form validation

**Destination groups (`/destinations`)**
- Can create a destination group → `afterEach` deletes it
- Can reference a group from a rule

**Policy publish (`/publish`)**
- Publish succeeds → version counter increments
- Second publish → version increments again (rollback list grows)

**Dashboard (`/dashboard`)**
- Page loads without error (metrics may be zero)
- Incident count card renders
- Top sites table renders

### Chrome extension

**Detection (mock ChatGPT page)**
- Keyword matching block rule → block modal appears
- Keyword matching warn rule → warn modal (not block) appears
- Cancel → `#output` unchanged (no send)
- Send anyway + reason → `#output` shows "SENT:"
- Text matching no rule → no modal

**Policy sync**
- Extension loads with test org token → `GET /v1/policy` returns seeded rules
- Detection fires on keyword from seeded policy (live data, not hardcoded)

### Golden path end-to-end
1. `globalSetup` seeds tenant + subject + `ACME_SECRET` block rule + published policy
2. Extension loads with test org token, fetches from test backend
3. Navigate to mock ChatGPT page → type `"ACME_SECRET"`
4. Assert block modal appears with subject name `"ACME Confidential"`
5. `globalTeardown` truncates

---

## Required Env Vars

**`.env.e2e.example`:**
```
# Test database (separate from production — create in Railway)
E2E_DATABASE_URL=postgres://...

# Where the admin app and backend are served during tests
E2E_ADMIN_URL=http://localhost:5173
E2E_BACKEND_URL=http://localhost:3000

# Clerk Development instance keys
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...

# Clerk test user + org (created once in Clerk dashboard)
E2E_CLERK_USER_ID=user_...
E2E_CLERK_ORG_ID=org_...
E2E_CLERK_USER_EMAIL=testuser@gmail.com
E2E_CLERK_USER_PASSWORD=...
```

Pre-filled values (already known):
- `CLERK_SECRET_KEY`: from `backend/.env`
- `CLERK_PUBLISHABLE_KEY`: from `admin/.env`
- `E2E_CLERK_USER_ID`: `user_3E4O1a83pc0JvS7AKBGfRzFo2EZ`
- `E2E_CLERK_ORG_ID`: `org_3E4NtFEFGda9cWHoeLcwuanK5dU`
- `E2E_CLERK_USER_EMAIL`: `testuser@gmail.com`

**Remaining manual step:** Create a Railway test Postgres → set `E2E_DATABASE_URL`.

---

## GitHub Actions Workflow

**Trigger:** PRs targeting `main` + pushes to `main`.

```yaml
# .github/workflows/e2e.yml
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
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }

      - run: pnpm install
      - run: pnpm exec playwright install chromium --with-deps

      - run: pnpm run build
      - run: pnpm --filter ciyo-admin run build

      - name: Run migrations on test DB
        run: pnpm --filter backend run db:migrate
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}

      - name: Start backend (test DB)
        run: pnpm --filter backend run start &
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          CLERK_WEBHOOK_SECRET: ${{ secrets.CLERK_WEBHOOK_SECRET }}
          PORT: 3000

      - name: Serve admin app
        run: pnpm --filter ciyo-admin run preview -- --port 5173 &
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: http://localhost:3000

      - name: Run E2E suite
        run: pnpm --filter e2e run test
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

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
```

**GitHub secrets to add** (repo Settings → Secrets → Actions):
```
E2E_DATABASE_URL
CLERK_SECRET_KEY
VITE_CLERK_PUBLISHABLE_KEY
E2E_CLERK_USER_ID
E2E_CLERK_ORG_ID
E2E_CLERK_USER_PASSWORD
CLERK_WEBHOOK_SECRET
```

---

## Local Developer Workflow

```bash
# One-time setup
cp e2e/.env.e2e.example e2e/.env.e2e   # fill in E2E_DATABASE_URL + password
pnpm --filter backend run db:migrate    # run migrations on test DB

# Run full suite
pnpm --filter e2e test

# Run only admin tests
pnpm --filter e2e test --project=admin

# Run only extension tests
pnpm --filter e2e test --project=extension

# Run a single spec
pnpm --filter e2e test e2e/admin/members.spec.ts
```

---

## Out of Scope

- Billing flows — covered by `backend/tests/billing-*.test.ts`
- Clerk webhook processing — covered by `backend/tests/clerk-webhook.test.ts`
- Analytics accuracy — covered by `backend/tests/analytics.test.ts`
- Multi-browser (Firefox, Safari) — Chrome extension is Chromium-only; admin tests start with Chromium
- AI Policy Assistant — not built yet
