import { test as setup, expect } from '@playwright/test'
import { clerkSetup } from '@clerk/testing/playwright'
import path from 'path'
import { env, requireEnv } from '../../env'

const AUTH_FILE = path.join(__dirname, '../../.auth/console.json')

setup('authenticate to console via Clerk', async ({ page }) => {
  const consoleUrl = requireEnv('QA_CONSOLE_URL')
  const publishableKey = requireEnv('QA_CLERK_PUBLISHABLE_KEY')
  const email = requireEnv('QA_CLERK_USER_EMAIL')
  const password = requireEnv('QA_CLERK_USER_PASSWORD')

  // secretKey is optional here: without it clerkSetup falls back to CLERK_SECRET_KEY / CLERK_TESTING_TOKEN from the shell.
  await clerkSetup({ publishableKey, secretKey: env.QA_CLERK_SECRET_KEY })

  await page.goto(consoleUrl + '/login')
  await page.getByRole('button', { name: /sign in/i }).click()

  await page.getByLabel(/email address/i).fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)

  await page.context().storageState({ path: AUTH_FILE })
})
