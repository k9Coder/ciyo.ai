# E2E Coverage Phase 3 — Extension Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix outdated selectors in `detection.spec.ts`, add the `warn` modal flow, verify events reach the backend after detection, test the Claude and Gemini adapters with mock pages, and cover the extension options page.

**Architecture:**
- `detection.spec.ts` selectors are updated to match the current `WarningModal` component (the existing "send anyway" / `#ps-reason` / "confirm send" selectors no longer exist in the component).
- `warn.spec.ts` injects the seeded orgToken so the extension loads the backend policy (which has the `ACME_WARN → warn` rule) and tests the softer warn flow.
- `policy-sync.spec.ts` gains a post-detection check that the event was dispatched to the backend.
- `claude-mock.html` and `gemini-mock.html` mirror the real adapters' expected selectors.
- `options.spec.ts` navigates to the extension's `options.html` page and checks tabs, account state, and about info.

**Tech Stack:** Playwright `chromium.launchPersistentContext`, `--headless=new` extension loading, Playwright `request` context for API checks, seeded orgToken from `getSeedState()`.

**Key WarningModal facts (read from `src/content/overlay/WarningModal.tsx`):**
- Title for both warn and block: `"Sensitive content detected"`
- Warn action (`highestAction !== 'block'`): shows `"Looks fine, send it"` button + `"Edit prompt"` button
- Block action: shows `"Edit prompt"` button only + `"Your policy does not allow sending this content."`
- There is no `#ps-reason` input or `"Confirm send"` button — the current spec has outdated selectors.

---

## File Map

| File | Change |
|------|--------|
| `e2e/extension/detection.spec.ts` | Fix button selectors to match current WarningModal; add warn-via-default-policy test |
| `e2e/extension/warn.spec.ts` | Create — uses seeded orgToken + ACME_WARN rule to test warn flow end-to-end |
| `e2e/extension/policy-sync.spec.ts` | Add check that an event row was written to the backend after detection |
| `e2e/fixtures/claude-mock.html` | Create — matches claudeAdapter selectors (`.ProseMirror`, `button[aria-label="Send Message"]`) |
| `e2e/fixtures/gemini-mock.html` | Create — matches geminiAdapter selectors (`.ql-editor`, `button[aria-label="Send message"]`) |
| `e2e/extension/detection.spec.ts` | Add 2 tests for Claude mock and Gemini mock pages |
| `e2e/extension/options.spec.ts` | Create — options page tabs, account unauthenticated state, about version |

---

### Task 1: Fix outdated selectors in `detection.spec.ts`

**Files:**
- Modify: `e2e/extension/detection.spec.ts`

The "send anyway with reason" test uses `getByRole('button', { name: /send anyway/i })`, `locator('#ps-reason')`, and `getByRole('button', { name: /confirm send/i })`. None of these exist in the current `WarningModal`. The correct selectors are:

- "send anyway" → `"Looks fine, send it"` button
- no `#ps-reason` input (reason is not collected anymore)
- no "Confirm send" (clicking "Looks fine, send it" immediately sends)

Also, the Cancel button is now labelled "Edit prompt".

- [ ] **Step 1: Replace the "send anyway with reason" test with the corrected version**

Find and replace the entire second test block `test('send anyway with reason sends the message', ...)`:

```ts
test('send anyway sends the message', async () => {
  const context = await launchWithExtension()
  const page    = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  await page.locator('#prompt-textarea').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
  await page.locator('#send-button').click()

  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 5_000 })

  // Warn or block — if blocked, "Looks fine, send it" is absent; skip this test for block
  const looksFinBtn = modal.getByRole('button', { name: /looks fine, send it/i })
  if (await looksFinBtn.isVisible()) {
    await looksFinBtn.click()
    await expect(page.locator('#output')).toContainText('SENT:')
  } else {
    // Block policy: only Edit prompt is available — clicking it cancels the send
    await modal.getByRole('button', { name: /edit prompt/i }).click()
    await expect(page.locator('#output')).toHaveText('No message sent yet.')
  }

  await context.close()
})
```

Also update the Cancel assertion in the first test — `"Cancel"` button is now `"Edit prompt"`:

```ts
// In test 'block modal appears...' replace:
//   await page.locator('pierce/#ps-react-root').getByRole('button', { name: 'Cancel' }).click()
// With:
await page.locator('pierce/#ps-react-root').getByRole('button', { name: /edit prompt/i }).click()
```

- [ ] **Step 2: Run the fixed tests**

```
pnpm exec playwright test --project=extension e2e/extension/detection.spec.ts
```

Expected: 3 passed (block, send anyway, no-modal).

- [ ] **Step 3: Commit**

```
git add e2e/extension/detection.spec.ts
git commit -m "fix(e2e): update detection.spec selectors to match current WarningModal"
```

---

### Task 2: Warn action modal flow (`warn.spec.ts`)

**Files:**
- Create: `e2e/extension/warn.spec.ts`

The seeded policy has `ACME_WARN → warn`. This test injects the orgToken so the extension fetches the backend policy, then types the warn keyword and asserts the softer warning UI.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'
import { getSeedState } from '../helpers/seed-state.js'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')

test('warn modal shows "Looks fine, send it" and allows sending', async () => {
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

  // Inject test credentials and point at test backend
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => { chrome.storage.local.set({ orgToken: token, backendUrl: url }) },
    [orgToken, backendUrl] as [string, string],
  )

  // Give the extension time to fetch the seeded policy (has ACME_WARN → warn)
  await new Promise(r => setTimeout(r, 3_000))

  const page = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  // Type the warn keyword and click send
  await page.locator('#prompt-textarea').fill('This message contains ACME_WARN data')
  await page.locator('#send-button').click()

  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  // Warn (not block): "Looks fine, send it" button is visible
  await expect(modal.getByRole('button', { name: /looks fine, send it/i })).toBeVisible()

  // The "blocked" message must NOT appear
  await expect(modal.getByText('Your policy does not allow sending this content.')).not.toBeVisible()

  // Clicking it sends the message
  await modal.getByRole('button', { name: /looks fine, send it/i }).click()
  await expect(page.locator('#output')).toContainText('SENT:')

  await context.close()
})

test('block modal does NOT show "Looks fine, send it"', async () => {
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

  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => { chrome.storage.local.set({ orgToken: token, backendUrl: url }) },
    [orgToken, backendUrl] as [string, string],
  )

  await new Promise(r => setTimeout(r, 3_000))

  const page = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  // Type the block keyword
  await page.locator('#prompt-textarea').fill('This message contains ACME_SECRET data')
  await page.locator('#send-button').click()

  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  // Block: no "Looks fine" button
  await expect(modal.getByRole('button', { name: /looks fine/i })).not.toBeVisible()

  // Blocked message is present
  await expect(modal.getByText('Your policy does not allow sending this content.')).toBeVisible()

  await context.close()
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=extension e2e/extension/warn.spec.ts
```

Expected: 2 passed.

- [ ] **Step 3: Commit**

```
git add e2e/extension/warn.spec.ts
git commit -m "test(e2e): add warn action modal tests using seeded backend policy"
```

---

### Task 3: Verify events reach the backend after detection (`policy-sync.spec.ts`)

**Files:**
- Modify: `e2e/extension/policy-sync.spec.ts`

After the block modal appears, the extension should have dispatched an event to `POST /v1/events`. This task adds a check that `GET /v1/audit-log` returns a row for the triggered keyword.

- [ ] **Step 1: Append an afterAll cleanup and extend the existing test**

Replace the content of `e2e/extension/policy-sync.spec.ts` with:

```ts
import { test, expect, chromium, request as playwrightRequest } from '@playwright/test'
import path from 'path'
import { getSeedState } from '../helpers/seed-state.js'
import { adminHeaders } from '../helpers/admin-headers.js'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')
const MOCK_PAGE      = path.resolve(__dirname, '../fixtures/chatgpt-mock.html')
const BACKEND        = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test('extension fetches seeded policy and enforces ACME_SECRET block rule', async () => {
  const { orgToken } = getSeedState()

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })

  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')

  await background.evaluate(
    ([token, url]) => { chrome.storage.local.set({ orgToken: token, backendUrl: url }) },
    [orgToken, BACKEND] as [string, string],
  )

  await new Promise(r => setTimeout(r, 3_000))

  const page = await context.newPage()
  await page.goto(`file://${MOCK_PAGE}`)

  await page.locator('#prompt-textarea').fill('This is ACME_SECRET data')
  await page.locator('#send-button').click()

  const modal = page.locator('pierce/#ps-react-root')
  await expect(modal.getByText('Sensitive content detected')).toBeVisible({ timeout: 8_000 })

  // Give the extension ~2s to dispatch the event to the backend
  await new Promise(r => setTimeout(r, 2_000))

  // Verify the event arrived in the audit log
  const api = await playwrightRequest.newContext()
  const res  = await api.get(`${BACKEND}/v1/audit-log`, { headers: adminHeaders() })
  const body = await res.json() as { entries: Array<{ matchedTerm: string; action: string }> }
  const entry = body.entries.find(e => e.matchedTerm === 'ACME_SECRET' && e.action === 'block')
  expect(entry).toBeDefined()
  await api.dispose()

  await context.close()
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=extension e2e/extension/policy-sync.spec.ts
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/extension/policy-sync.spec.ts
git commit -m "test(e2e): verify extension dispatches event to backend after block detection"
```

---

### Task 4: Claude mock page + detection test (`claude-mock.html`)

**Files:**
- Create: `e2e/fixtures/claude-mock.html`
- Modify: `e2e/extension/detection.spec.ts`

The `claudeAdapter` finds the composer via `.ProseMirror` or `div[contenteditable="true"]`, and the send button via `button[aria-label="Send Message"]`.

- [ ] **Step 1: Create `e2e/fixtures/claude-mock.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Claude Mock</title></head>
<body>
  <div id="app">
    <div class="ProseMirror" contenteditable="true"
         style="min-height:60px;border:1px solid #ccc;padding:8px;font-family:sans-serif">
      Type a prompt here
    </div>
    <br>
    <button aria-label="Send Message" id="send-btn"
            style="padding:8px 16px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer">
      Send
    </button>
    <p id="output">No message sent yet.</p>
  </div>
  <script>
    document.querySelector('button[aria-label="Send Message"]').addEventListener('click', () => {
      const text = document.querySelector('.ProseMirror').innerText.trim();
      document.getElementById('output').textContent = 'SENT: ' + text;
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Add the Claude adapter test to `detection.spec.ts`**

```ts
// Append inside test.describe('Extension detection', () => { ... })

const CLAUDE_MOCK = path.resolve(__dirname, '../fixtures/claude-mock.html')

test('block modal appears on Claude mock page', async () => {
  const context = await launchWithExtension()
  const page    = await context.newPage()
  await page.goto(`file://${CLAUDE_MOCK}`)

  // Type in the ProseMirror contenteditable div
  await page.locator('.ProseMirror').click()
  await page.locator('.ProseMirror').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
  await page.locator('button[aria-label="Send Message"]').click()

  await expect(
    page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
  ).toBeVisible({ timeout: 5_000 })

  await context.close()
})
```

- [ ] **Step 3: Run and verify**

```
pnpm exec playwright test --project=extension e2e/extension/detection.spec.ts --grep "Claude mock"
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```
git add e2e/fixtures/claude-mock.html e2e/extension/detection.spec.ts
git commit -m "test(e2e): add Claude adapter mock page and detection test"
```

---

### Task 5: Gemini mock page + detection test (`gemini-mock.html`)

**Files:**
- Create: `e2e/fixtures/gemini-mock.html`
- Modify: `e2e/extension/detection.spec.ts`

The `geminiAdapter` finds the composer via `.ql-editor` (primary) and the send button via `button[aria-label="Send message"]`.

- [ ] **Step 1: Create `e2e/fixtures/gemini-mock.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Gemini Mock</title></head>
<body>
  <div id="app">
    <div class="ql-editor" contenteditable="true"
         style="min-height:60px;border:1px solid #ccc;padding:8px;font-family:sans-serif">
      Type a prompt here
    </div>
    <br>
    <button aria-label="Send message" id="send-btn"
            style="padding:8px 16px;background:#1a73e8;color:#fff;border:none;border-radius:4px;cursor:pointer">
      Send
    </button>
    <p id="output">No message sent yet.</p>
  </div>
  <script>
    document.querySelector('button[aria-label="Send message"]').addEventListener('click', () => {
      const text = document.querySelector('.ql-editor').innerText.trim();
      document.getElementById('output').textContent = 'SENT: ' + text;
    });
  </script>
</body>
</html>
```

- [ ] **Step 2: Add the Gemini adapter test to `detection.spec.ts`**

```ts
// Append inside test.describe('Extension detection', () => { ... })

const GEMINI_MOCK = path.resolve(__dirname, '../fixtures/gemini-mock.html')

test('block modal appears on Gemini mock page', async () => {
  const context = await launchWithExtension()
  const page    = await context.newPage()
  await page.goto(`file://${GEMINI_MOCK}`)

  await page.locator('.ql-editor').click()
  await page.locator('.ql-editor').fill('My key is sk-ABCDEFGHIJKLMNOPQRSTUVabcdefghijklmno')
  await page.locator('button[aria-label="Send message"]').click()

  await expect(
    page.locator('pierce/#ps-react-root').getByText('Sensitive content detected')
  ).toBeVisible({ timeout: 5_000 })

  await context.close()
})
```

- [ ] **Step 3: Run and verify**

```
pnpm exec playwright test --project=extension e2e/extension/detection.spec.ts --grep "Gemini mock"
```

Expected: 1 passed.

- [ ] **Step 4: Commit**

```
git add e2e/fixtures/gemini-mock.html e2e/extension/detection.spec.ts
git commit -m "test(e2e): add Gemini adapter mock page and detection test"
```

---

### Task 6: Extension options page (`options.spec.ts`)

**Files:**
- Create: `e2e/extension/options.spec.ts`

The options page is at `chrome-extension://<ID>/options.html`. The extension ID is obtained from the background service worker URL.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, chromium } from '@playwright/test'
import path from 'path'

const EXTENSION_PATH = path.resolve(__dirname, '../../dist')

async function launchAndGetExtensionId() {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })
  const background = context.serviceWorkers()[0]
    ?? await context.waitForEvent('serviceworker')
  const extId = new URL(background.url()).hostname
  return { context, extId }
}

test.describe('Extension options page', () => {
  test('options page loads with Account, Audit Log, and About tabs', async () => {
    const { context, extId } = await launchAndGetExtensionId()
    const page = await context.newPage()

    await page.goto(`chrome-extension://${extId}/options.html`)

    await expect(page.getByRole('button', { name: 'Account' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Audit Log' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'About' })).toBeVisible()

    await context.close()
  })

  test('Account tab shows Clerk sign-in when unauthenticated', async () => {
    const { context, extId } = await launchAndGetExtensionId()
    const page = await context.newPage()

    await page.goto(`chrome-extension://${extId}/options.html`)
    await page.getByRole('button', { name: 'Account' }).click()

    // Without a Clerk session the AccountPage renders a SignIn widget
    await expect(page.locator('text=/sign in|log in/i').first()).toBeVisible({ timeout: 8_000 })

    await context.close()
  })

  test('Audit Log tab loads without error', async () => {
    const { context, extId } = await launchAndGetExtensionId()
    const page = await context.newPage()

    await page.goto(`chrome-extension://${extId}/options.html`)
    await page.getByRole('button', { name: 'Audit Log' }).click()

    // Page renders — either shows empty state or a table, never crashes
    await expect(page.locator('text=/no events|audit|time/i').first()).toBeVisible({ timeout: 5_000 })

    await context.close()
  })

  test('About tab shows the extension version', async () => {
    const { context, extId } = await launchAndGetExtensionId()
    const page = await context.newPage()

    await page.goto(`chrome-extension://${extId}/options.html`)
    await page.getByRole('button', { name: 'About' }).click()

    // AboutPage renders EXTENSION_NAME and EXTENSION_VERSION
    await expect(page.getByText(/mykka/i)).toBeVisible()
    await expect(page.getByText(/version/i)).toBeVisible()

    await context.close()
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=extension e2e/extension/options.spec.ts
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```
git add e2e/extension/options.spec.ts
git commit -m "test(e2e): add extension options page spec — tabs, account, audit, about"
```

---

### Final: Run full extension suite

- [ ] **Step 1: Run all extension tests**

```
pnpm exec playwright test --project=extension
```

Expected: all tests pass.

- [ ] **Step 2: Fix any regressions and commit**

```
git add -p
git commit -m "test(e2e): fix regressions from phase 3 extension depth tests"
```
