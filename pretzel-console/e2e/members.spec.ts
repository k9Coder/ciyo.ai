import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members', () => {
  test('can generate an invite link for a specific email', async ({ page }) => {
    await page.goto('/members')

    await page.getByRole('button', { name: /invite member/i }).click()

    await page.getByPlaceholder(/alice@/i).fill('e2e-invited@example.com')
    await page.locator('form').getByRole('button', { name: /generate link/i }).click()

    // URL input with the invite link appears
    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 5_000 })
    const urlInput = page.locator('input[readonly]')
    await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
    // No member row yet — invite must be accepted first
  })

  test('can generate an open invite link with no email', async ({ page }) => {
    await page.goto('/members')
    await page.getByRole('button', { name: /invite member/i }).click()

    // Leave email blank — open link (anyone with it can join)
    await page.locator('form').getByRole('button', { name: /generate link/i }).click()

    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 5_000 })
    const urlInput = page.locator('input[readonly]')
    await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
  })

  test('can change a member role', async ({ page }) => {
    // Create a throwaway member so we never modify the seeded super_admin
    const api = await playwrightRequest.newContext()
    const createRes = await api.post(`${BACKEND}/v1/members`, {
      headers: adminHeaders(),
      data: { email: 'e2e-role-edit@example.com', role: 'member' },
    })
    const member = await createRes.json() as { id: string }
    await api.dispose()

    await page.goto('/members')

    const memberRow = page.locator('tr', { hasText: 'e2e-role-edit@example.com' })
    await memberRow.getByRole('button', { name: 'Edit role' }).click()

    await memberRow.getByRole('combobox').selectOption('division_admin')
    await memberRow.getByRole('button', { name: 'Save' }).click()

    await expect(memberRow.getByText('Division Admin')).toBeVisible()

    // Cleanup
    const cleanupApi = await playwrightRequest.newContext()
    await cleanupApi.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await cleanupApi.dispose()
  })
})
