import { test, expect } from '@playwright/test'

// Token-invite-link flow retired (admin-add-by-email is the only invite
// mechanism now — see backend/src/webhooks/clerk.ts and
// pretzel-console/src/pages/MembersPage.tsx). Unlike the old open-invite-link
// journey this replaces, POST /v1/members writes a real row immediately, so
// this journey must clean up after itself (remove the member) rather than
// relying on "unaccepted invite creates nothing."
test.describe('Members', () => {
  test('admin can add a member directly by email, then remove them', async ({ page }) => {
    const email = `qa-journey-${Date.now()}@example.com`
    await page.goto('/members')

    await page.getByRole('button', { name: /add member/i }).click()
    await page.locator('form').getByPlaceholder('alice@lawfirm.com').fill(email)
    await page.locator('form').getByRole('button', { name: /^add member$/i }).click()

    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible({ timeout: 15_000 })

    await row.getByRole('button', { name: /remove/i }).click()
    await page.getByRole('button', { name: /^delete$/i }).click()
    await expect(row).not.toBeVisible({ timeout: 15_000 })
  })
})
