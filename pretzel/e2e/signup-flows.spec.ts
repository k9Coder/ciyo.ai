/**
 * A brand-new person signs up FROM the extension (options page, Clerk's own sign-up form).
 *
 *   existing organisation -> an admin already added their email. One sign-up and they are signed in:
 *                            no second "now sign in" step, their org is selected, the extension is
 *                            authenticated. Also when the Clerk webhook arrives late or twice.
 *   no organisation       -> told to ask their admin, signed back out, nothing created for them
 *                            (the extension never creates organisations).
 *
 * Real Clerk dev instance + real backend + the real built extension (`pnpm build:e2e`).
 * The popup has no sign-up form of its own: on production it offers Google (a device flow through
 * the console, covered by pretzel-console/e2e/signup-flows.spec.ts) and "Sign in with email", which
 * just opens this options page.
 */
import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test'
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import path from 'path'
import {
  TEST_PASSWORD, existingOrgId, uniqueTestEmail, adminAddsMember, memberByEmail, listMembers,
  findClerkUser, postUserCreatedWebhook, webhookSecret, cleanupSignup,
} from './helpers/signup'

const EXT_PATH = path.resolve(__dirname, '../dist')

test.beforeAll(async () => {
  await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY })
})

let context: BrowserContext | undefined
let email = ''

test.afterEach(async () => {
  await context?.close().catch(() => {})
  context = undefined
  if (email) await cleanupSignup(email)
  email = ''
})

async function openOptionsPage(): Promise<{ page: Page; storage: (keys: string[]) => Promise<Record<string, unknown>> }> {
  context = await chromium.launchPersistentContext('', {
    headless: false,
    args: ['--headless=new', `--disable-extensions-except=${EXT_PATH}`, `--load-extension=${EXT_PATH}`],
  })
  const sw = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  const extId = new URL(sw.url()).hostname
  const page = await context.newPage()
  await setupClerkTestingToken({ page })
  await page.goto(`chrome-extension://${extId}/src/options/index.html`)
  const storage = (keys: string[]) => sw.evaluate((k) => chrome.storage.local.get(k), keys) as Promise<Record<string, unknown>>
  return { page, storage }
}

/** The one and only form the person fills: Clerk's sign-up inside the options page. */
async function signUp(page: Page, address: string) {
  await page.getByRole('button', { name: /create an account/i }).click()
  await page.getByLabel(/email address/i).fill(address)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

test.describe('extension sign-up', () => {
  test('existing organisation: ONE sign-up leaves them signed in, on the right org, no second sign-in', async () => {
    email = uniqueTestEmail('ext-member')
    await adminAddsMember(email, 'member')
    const { page, storage } = await openOptionsPage()

    await signUp(page, email)

    // Signed in: their account shows, with a sign-out button...
    await expect(page.getByText(email)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
    // ...and no sign-in/sign-up form or "not enrolled" message is left on screen.
    await expect(page.locator('input[type="password"]')).toHaveCount(0)
    await expect(page.getByText(/no account found/i)).toHaveCount(0)

    // The extension is authenticated and pointed at the company org (what policy sync uses).
    await expect.poll(async () => (await storage(['selectedTenantId'])).selectedTenantId, { timeout: 20_000 })
      .toBe(existingOrgId())
    expect(typeof (await storage(['clerkSessionToken'])).clerkSessionToken).toBe('string')
  })

  test('existing organisation: a late (or duplicate) Clerk webhook changes nothing', async () => {
    test.skip(!webhookSecret(), 'set E2E_CLERK_WEBHOOK_SECRET (the backend CLERK_WEBHOOK_SECRET) to exercise the webhook')
    email = uniqueTestEmail('ext-late-webhook')
    await adminAddsMember(email, 'member')
    const { page } = await openOptionsPage()

    await signUp(page, email)
    await expect(page.getByText(email)).toBeVisible({ timeout: 30_000 }) // signed in BEFORE any webhook

    const clerkUser = await findClerkUser(email)
    expect(clerkUser).not.toBeNull()
    expect(await postUserCreatedWebhook(clerkUser!.id, email)).toBe(200) // the slow delivery
    expect(await postUserCreatedWebhook(clerkUser!.id, email)).toBe(200) // Clerk retries

    const rows = (await listMembers()).filter(m => m.email.toLowerCase() === email.toLowerCase())
    expect(rows).toHaveLength(1) // still the one row the admin created
    await expect(page.getByText(email)).toBeVisible()
  })

  test('no organisation: told to ask their admin, signed out again, nothing is created', async () => {
    email = uniqueTestEmail('ext-solo')
    const membersBefore = (await listMembers()).length
    const { page, storage } = await openOptionsPage()

    await signUp(page, email)

    await expect(page.getByText(/no account found for this email/i)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0)

    expect((await storage(['selectedTenantId'])).selectedTenantId).toBeUndefined()
    expect(await memberByEmail(email)).toBeUndefined()
    expect((await listMembers()).length).toBe(membersBefore)
  })
})
