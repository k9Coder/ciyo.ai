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
  await page.locator('input[type="password"]').fill(process.env.E2E_CLERK_USER_PASSWORD!)
  await page.getByRole('button', { name: /continue/i }).click()

  // Wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)

  // Save the authenticated session
  await page.context().storageState({ path: AUTH_FILE })
})
