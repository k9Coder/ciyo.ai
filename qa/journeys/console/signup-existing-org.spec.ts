import { test, expect } from '@playwright/test'
import { clerkSetup, setupClerkTestingToken } from '@clerk/testing/playwright'
import { env } from '../../env'

// Business flow: "my admin added my email — I sign up ONCE and I'm in."
//
// The QA admin (authenticated project storage state) adds a brand-new email under Members. A
// separate, signed-out browser then signs up through Clerk's own form with that email. The new
// person must land straight on the member page ("You're all set") after that single form: no
// "Couldn't load your account" screen, no second sign-in.
//
// Needs QA_CLERK_SECRET_KEY (see .env.qa.example): Clerk bot protection blocks a scripted sign-up
// without a testing token, and the throwaway Clerk user is deleted with the same key afterwards.
// The "no organisation yet" flow is deliberately NOT scripted here: it would leave a real
// personal organisation behind on shared staging — see plans/signup-flows-test-plan.md (SU-01).
const secretKey = env.QA_CLERK_SECRET_KEY
const publishableKey = env.QA_CLERK_PUBLISHABLE_KEY

async function deleteClerkUser(email: string): Promise<void> {
  const headers = { Authorization: `Bearer ${secretKey}` }
  const res = await fetch(`https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`, { headers })
  if (!res.ok) return
  for (const u of await res.json() as Array<{ id: string }>) {
    await fetch(`https://api.clerk.com/v1/users/${u.id}`, { method: 'DELETE', headers })
  }
}

test.describe('New user sign-up into an existing organisation', () => {
  test.skip(!secretKey || !publishableKey, 'set QA_CLERK_SECRET_KEY and QA_CLERK_PUBLISHABLE_KEY in the QA env file to run this journey')

  test('admin adds an email; that person signs up once and lands on the member page', async ({ page, browser }) => {
    // Stays under Clerk's "+clerk_test" convention so it is recognised as a test account.
    const email = `qa-signup-${Date.now()}+clerk_test@example.com`
    await clerkSetup({ publishableKey, secretKey })

    // 1. As the admin, add the email (same UI path as the member-invite journey).
    await page.goto('/members')
    await page.getByRole('button', { name: /add member/i }).click()
    await page.locator('form').getByPlaceholder('alice@lawfirm.com').fill(email)
    await page.locator('form').getByRole('button', { name: /^add member$/i }).click()
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible({ timeout: 15_000 })

    const guestContext = await browser.newContext({ baseURL: env.QA_CONSOLE_URL, storageState: { cookies: [], origins: [] } })
    try {
      // 2. As the new person, signed out: ONE trip through Clerk's sign-up form.
      const guest = await guestContext.newPage()
      await setupClerkTestingToken({ page: guest })
      await guest.goto('/login')
      await guest.getByRole('button', { name: /sign in/i }).click()
      await guest.getByRole('link', { name: /sign up/i }).click()
      await guest.getByLabel(/email address/i).fill(email)
      await guest.locator('input[type="password"]').fill('Pretzel-qa-Passw0rd!-signup')
      await guest.getByRole('button', { name: 'Continue', exact: true }).click()

      // 3. They are enrolled as a plain member: the friendly member page, not an error, not a second login.
      await expect(guest).toHaveURL(/unauthorized/, { timeout: 30_000 })
      await expect(guest.getByRole('heading', { name: /you.re all set/i })).toBeVisible()
      await expect(guest.getByText(/couldn.t load your account/i)).toHaveCount(0)
    } finally {
      await guestContext.close()
      // 4. Clean up: the member row (via the UI, as the admin) and the Clerk user.
      await row.getByRole('button', { name: /remove/i }).click()
      await page.getByRole('button', { name: /^delete$/i }).click()
      await expect(row).not.toBeVisible({ timeout: 15_000 })
      await deleteClerkUser(email)
    }
  })
})
