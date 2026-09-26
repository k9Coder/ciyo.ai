/**
 * A brand-new person signs up through the console (Clerk's own sign-up form, no shortcuts).
 *
 *   no organisation       -> gets a personal org and lands in the onboarding wizard
 *   existing organisation -> (an admin already added their email) joins THAT org, no personal org;
 *                            an admin lands on the Overview, a plain member on "You're all set"
 *   extension relay       -> /extension-login, the page the extension's Google/device flow opens:
 *                            a new user in an existing org gets the sign-in code on the first pass
 *
 * The Clerk `user.created` webhook cannot reach a local backend, so these also prove the console
 * works when the webhook is late or never arrives (the backend provisions the user just-in-time).
 * Each test creates its own Clerk user and removes it, and the pre-added member row, afterwards.
 */
import { test, expect, type Page } from '@playwright/test'
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { createHash, randomBytes } from 'node:crypto'
import {
  BACKEND, TEST_PASSWORD, uniqueTestEmail, adminAddsMember, cleanupSignup,
} from './helpers/signup.js'

// A brand-new visitor, not the seeded admin the other specs reuse.
test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  await clerkSetup({ publishableKey: process.env.CLERK_PUBLISHABLE_KEY, secretKey: process.env.CLERK_SECRET_KEY })
})

/** In Clerk's modal: switch to "Sign up", fill the form once, submit. */
async function fillSignUp(page: Page, email: string) {
  await page.getByRole('link', { name: /sign up/i }).click()
  await page.getByLabel(/email address/i).fill(email)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

/** Console /login: Clerk's sign-up form is embedded on the page (no modal). */
async function signUpFromLoginPage(page: Page, email: string) {
  await setupClerkTestingToken({ page })
  await page.goto('/login')
  await page.getByRole('link', { name: /set up your organization/i }).click()
  await page.getByLabel(/email address/i).fill(email)
  await page.locator('input[type="password"]').fill(TEST_PASSWORD)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()
}

let email: string
test.afterEach(async () => { if (email) await cleanupSignup(email) })

test.describe('console sign-up', () => {
  test('no organisation: lands in onboarding with a personal org, never on an error screen', async ({ page }) => {
    email = uniqueTestEmail('console-solo')
    await signUpFromLoginPage(page, email)

    await expect(page).toHaveURL(/onboarding\/profile/, { timeout: 30_000 })
    await expect(page.getByText(/set up your dlp policy/i)).toBeVisible()
    await expect(page.getByText(/couldn.t load your account/i)).toHaveCount(0)
  })

  test('existing organisation, admin: joins that org and lands on the Overview (no personal org)', async ({ page }) => {
    email = uniqueTestEmail('console-admin')
    await adminAddsMember(email, 'super_admin')
    await signUpFromLoginPage(page, email)

    await expect(page).toHaveURL(/dashboard/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /overview/i })).toBeVisible()
    // The seeded org, not an auto-created "<name>'s Organization".
    await expect(page.getByRole('complementary').getByText('E2E Test Org')).toBeVisible()
  })

  test('existing organisation, plain member: sees "You\'re all set", not the admin app', async ({ page }) => {
    email = uniqueTestEmail('console-member')
    await adminAddsMember(email, 'member')
    await signUpFromLoginPage(page, email)

    await expect(page).toHaveURL(/unauthorized/, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: /you.re all set/i })).toBeVisible()
  })
})

// The extension's PKCE handshake, driven from the console side (Google itself can't be automated).
const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/callback'

function pkce() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

async function openExtensionRelay(page: Page, challenge: string, state: string) {
  const redirects: string[] = []
  await page.route('**://*.chromiumapp.org/**', route => {
    redirects.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'text/plain', body: 'extension redirect captured' })
  })
  await setupClerkTestingToken({ page })
  const q = new URLSearchParams({ state, code_challenge: challenge, redirect_uri: REDIRECT_URI })
  await page.goto(`/extension-login?${q}`)
  return redirects
}

test.describe('extension sign-in relay (/extension-login)', () => {
  test('new user in an existing org gets the sign-in code on the first pass and can use it', async ({ page }) => {
    email = uniqueTestEmail('relay-member')
    await adminAddsMember(email, 'member')
    const { verifier, challenge } = pkce()
    const state = randomBytes(8).toString('hex')

    const redirects = await openExtensionRelay(page, challenge, state)
    await fillSignUp(page, email) // the ONLY sign-up/sign-in interaction

    await expect.poll(() => redirects.length, { timeout: 30_000 }).toBeGreaterThan(0)
    const params = new URL(redirects[0]!).searchParams
    expect(params.get('state')).toBe(state)
    const code = params.get('code')!
    expect(code).toBeTruthy()

    // What the extension does next: exchange the code, then sync the company policy with the token.
    const exchange = await fetch(`${BACKEND}/auth/extension/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: REDIRECT_URI }),
    })
    expect(exchange.status).toBe(200)
    const { token } = await exchange.json() as { token: string }
    expect(token).toMatch(/^pd_/)

    const policy = await fetch(`${BACKEND}/v1/policy`, { headers: { Authorization: `Bearer ${token}` } })
    expect(policy.status).toBe(200)
    expect((await policy.json() as { tenantName: string }).tenantName).toBe('E2E Test Org')
  })

  test('new user with no organisation is told to ask their admin, and gets no code', async ({ page }) => {
    email = uniqueTestEmail('relay-solo')
    const { challenge } = pkce()

    const redirects = await openExtensionRelay(page, challenge, 'st-solo')
    await fillSignUp(page, email)

    await expect(page.getByText(/not enrolled in any organi[sz]ation|contact your admin/i)).toBeVisible({ timeout: 30_000 })
    expect(redirects).toHaveLength(0)
  })
})
